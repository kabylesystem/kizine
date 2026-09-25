import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { rawDb } from "@/db/client";
import { buildContext } from "@/server/plan-service";
import type { SlotKind } from "@/core/types";
import { reshuffleDay, coveredByStock, fitsSlot, type Cell } from "@/core/reshuffle";
import { loadHighs } from "@/core/highs";
import { solveMeal } from "@/core/solver";
import { join } from "node:path";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  context: z.enum(["home", "school", "away", "flexible"]).optional(),
  /** Retirer ou remettre la collation de CE jour, sans toucher au réglage général. */
  noSnack: z.boolean().optional(),
});

const MINUTES: Record<string, number> = { home: 55, school: 35, away: 20, flexible: 40 };

/** Ce qu'on peut préparer la veille pour l'emporter le lendemain. */
const PREP_AHEAD_MINUTES: Record<string, number> = { breakfast: 15, lunch: 40, snack: 15 };

interface SlotRow {
  id: string;
  slot: string;
  plan_id: string;
  week_start: string;
  seed: number;
  basket_locked_at: number | null;
  meal_id: string | null;
  state: string | null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { date, noSnack } = parsed.data;
  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);

  const slotRows = await db
    .prepare(
      `SELECT s.id, s.slot, s.plan_id, p.week_start, p.seed, p.basket_locked_at, m.id AS meal_id, m.state
       FROM meal_slots s
       JOIN meal_plans p ON p.id = s.plan_id
       LEFT JOIN meals m ON m.slot_id = s.id
       WHERE s.date = ?`,
    )
    .all(date) as unknown as SlotRow[];
  if (slotRows.length === 0) return NextResponse.json({ error: "aucun créneau ce jour" }, { status: 404 });

  const first = slotRows[0]!;
  // Le contexte déjà enregistré sert de base quand on ne change que la collation.
  const stored = (await db
    .prepare("SELECT context, no_snack FROM day_overrides WHERE user_id = ? AND date = ?")
    .get((await currentUserId()), date)) as { context: string; no_snack: number } | undefined;
  const context = parsed.data.context ?? stored?.context ?? "home";
  const snackOff = noSnack ?? Number(stored?.no_snack ?? 0) === 1;
  const minutes = MINUTES[context] ?? 40;
  const portable = context !== "home";
  const locked = first.basket_locked_at !== null;

  // Le contexte du jour redéfinit le temps disponible et la contrainte de transport.
  try {
    await db.tx(async (trx) => {
      await trx.prepare(
        `INSERT INTO day_overrides (user_id, date, context, cook_minutes_evening, meal_slots, no_snack, note) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(user_id, date) DO UPDATE SET context = excluded.context, cook_minutes_evening = excluded.cook_minutes_evening,
           meal_slots = excluded.meal_slots, no_snack = excluded.no_snack, note = excluded.note`,
      ).run((await currentUserId()), date, context, minutes, null, snackOff ? 1 : 0, null);

      // La collation se retire et se remet. La retirer supprime son créneau ;
      // la remettre le recrée, sinon le bouton n'était qu'un aller simple.
      const snackSlot = slotRows.find((r) => r.slot === "snack");
      if (snackOff && snackSlot) {
        await trx.prepare("DELETE FROM meal_slots WHERE id = ?").run(snackSlot.id);
      }
      for (const row of slotRows) {
        const isDinner = row.slot === "dinner";
        const slotPortable = !isDinner && portable;
        // Un repas transportable se prépare la veille à la maison : il garde un vrai
        // budget de préparation. C'est le drapeau « portable » qui dit qu'on ne peut
        // pas cuisiner sur place, pas un temps de cuisson nul.
        const prepBudget = slotPortable
          ? PREP_AHEAD_MINUTES[row.slot] ?? 30
          : isDinner
            ? minutes
            : Math.max(10, Math.round(minutes * 0.7));
        await trx.prepare("UPDATE meal_slots SET max_minutes = ?, portable = ? WHERE id = ?").run(
          prepBudget,
          slotPortable ? 1 : 0,
          row.id,
        );
      }
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return locked
    ? permute(first, date, context)
    : adjustDay(first, date, context, snackOff, now);
}

/**
 * Courses faites : les plats de la semaine sont déjà dans le frigo.
 * Un jour qui change ne fait plus qu'échanger sa place avec un autre jour,
 * donc la liste de courses reste vraie quoi qu'il arrive.
 */
async function permute(first: SlotRow, date: string, context: string): Promise<NextResponse> {
  const db = rawDb();
  const { ctx } = await buildContext(first.week_start, first.seed);

  const fresh = await db
    .prepare("SELECT id, max_minutes, portable FROM meal_slots WHERE plan_id = ?")
    .all(first.plan_id) as unknown as { id: string; max_minutes: number; portable: number }[];
  const freshById = new Map(fresh.map((r) => [r.id, r]));
  const slotsById = new Map(
    ctx.slots.map((s) => {
      const f = freshById.get(s.id);
      return [s.id, f ? { ...s, maxMinutes: f.max_minutes, portable: f.portable === 1 } : s];
    }),
  );
  const recipesById = new Map(ctx.recipes.map((r) => [r.id, r]));

  const rows = await db
    .prepare(
      `SELECT s.id AS slot_id, s.date, m.id AS meal_id, m.state, ri.recipe_id
       FROM meal_slots s
       JOIN meals m ON m.slot_id = s.id
       JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       WHERE s.plan_id = ?`,
    )
    .all(first.plan_id) as unknown as {
    slot_id: string;
    date: string;
    meal_id: string;
    state: string;
    recipe_id: string;
  }[];
  const mealBySlot = new Map(rows.map((r) => [r.slot_id, r.meal_id]));
  const cells: Cell[] = rows.map((r) => ({
    slotId: r.slot_id,
    date: r.date,
    recipeId: r.recipe_id,
    cooked: r.state === "cooked",
  }));

  const { swaps, unresolved } = reshuffleDay(date, cells, slotsById, recipesById, ctx);

  // Repli sur le stock réel : si aucun échange ne marche, on ne pioche que dans
  // ce qui est déjà acheté, jamais dans un plat qui exigerait une course de plus.
  const stock = new Map<string, number>();
  for (const lot of await db
    .prepare(
      "SELECT concept_id, SUM(quantity_g) AS g FROM pantry_items WHERE user_id = ? AND quantity_g > 0 GROUP BY concept_id",
    )
    .all((await currentUserId())) as unknown as { concept_id: string; g: number }[]) {
    stock.set(lot.concept_id, Number(lot.g));
  }

  const fallbacks: { slotId: string; recipeId: string }[] = [];
  const stillStuck: string[] = [];
  for (const slotId of unresolved) {
    const slot = slotsById.get(slotId);
    if (!slot) continue;
    const pick = ctx.recipes
      .filter((r) => fitsSlot(r, slot, ctx) && coveredByStock(r, stock, ctx))
      .sort((a, b) => a.activeMinutes - b.activeMinutes)[0];
    if (pick) fallbacks.push({ slotId, recipeId: pick.id });
    else stillStuck.push(slotId);
  }

  // Les grammes changent quand un plat change de jour : la cible calorique du
  // créneau n'est pas la même. On resout chaque repas touché avant d'écrire.
  const solver = await loadHighs(join(process.cwd(), "node_modules", "highs", "build"));
  const touched: { slotId: string; recipeId: string }[] = [];
  for (const sw of swaps) {
    touched.push({ slotId: sw.slotA, recipeId: sw.recipeB });
    touched.push({ slotId: sw.slotB, recipeId: sw.recipeA });
  }
  touched.push(...fallbacks);

  const solvedBySlot = new Map<
    string,
    { grams: Record<string, number>; totals: ReturnType<typeof solveMeal>["totals"]; status: string }
  >();
  for (const t of touched) {
    const slot = slotsById.get(t.slotId);
    const recipe = recipesById.get(t.recipeId);
    if (!slot || !recipe) continue;
    const solved = solveMeal(solver, recipe.ingredients, {
      kcal: slot.kcalTarget,
      kcalTolerance: 25,
      proteinMin: slot.proteinTarget,
      animalMinG: ctx.mainSlots.has(slot.slot) ? ctx.meatPerMainMealG : 0,
    });
    solvedBySlot.set(t.slotId, { grams: solved.grams, totals: solved.totals, status: solved.status });
  }

  const now = Math.floor(Date.now() / 1000);
  try {
    await db.tx(async (trx) => {
      const instStmt = trx.prepare(
        "INSERT INTO recipe_instances (id, recipe_id, user_id, grams, kcal, protein_g, carb_g, fat_g, fiber_g, cost_cents, solver_status, solver_trace, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      );
      for (const t of touched) {
        const mealId = mealBySlot.get(t.slotId);
        const solved = solvedBySlot.get(t.slotId);
        if (!mealId || !solved) continue;
        const instId = randomUUID();
        await instStmt.run(
          instId,
          t.recipeId,
          (await currentUserId()),
          JSON.stringify(solved.grams),
          solved.totals.kcal,
          solved.totals.protein,
          solved.totals.carb,
          solved.totals.fat,
          solved.totals.fiber,
          null,
          solved.status,
          null,
          now,
        );
        await trx.prepare("UPDATE meals SET recipe_instance_id = ? WHERE id = ?").run(instId, mealId);
      }
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    context,
    mode: "swap",
    swapped: swaps.length,
    fromStock: fallbacks.length,
    stuck: stillStuck.length,
  });
}

/**
 * Ajustement d'une journée, sans toucher au reste.
 *
 * Avant, chaque clic sur Home/Out/Busy/NS relançait le planificateur sur toute
 * la journée avec une graine neuve : les trois plats changeaient à chaque fois,
 * comme un bouton « au hasard ». Ce n'est pas ce qu'on demande en disant
 * « je serai dehors ».
 *
 * Règle : on garde les plats. On recalcule leurs GRAMMES, parce que retirer
 * une collation change la cible de chaque repas restant. On ne remplace un
 * plat que s'il ne tient vraiment plus le créneau, un par un.
 */
async function adjustDay(
  first: SlotRow,
  date: string,
  context: string,
  snackOff: boolean,
  now: number,
): Promise<NextResponse> {
  const db = rawDb();

  // Le contexte a changé : les cibles du jour sont recalculées de zéro,
  // en tenant compte de la collation retirée ou remise.
  const { ctx } = await buildContext(first.week_start, first.seed);
  const dayTargets = new Map(ctx.slots.filter((s) => s.date === date).map((s) => [s.slot, s]));

  const existing = (await db
    .prepare(
      `SELECT s.id, s.slot, s.kcal_target, s.protein_target, s.max_minutes, s.portable,
              m.id AS meal_id, m.state, ri.recipe_id
       FROM meal_slots s
       LEFT JOIN meals m ON m.slot_id = s.id
       LEFT JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       WHERE s.date = ?`,
    )
    .all(date)) as {
    id: string;
    slot: string;
    kcal_target: number;
    protein_target: number;
    max_minutes: number;
    portable: number;
    meal_id: string | null;
    state: string | null;
    recipe_id: string | null;
  }[];

  const recipeById = new Map(ctx.recipes.map((r) => [r.id, r]));
  const solver = await loadHighs(join(process.cwd(), "node_modules", "highs", "build"));

  let retargeted = 0;
  let swapped = 0;
  let created = 0;

  try {
    await db.tx(async (trx) => {
      // La collation remise a besoin de son créneau : il a été supprimé.
      const hasSnack = existing.some((r) => r.slot === "snack");
      const snackTarget = dayTargets.get("snack");
      if (!snackOff && !hasSnack && snackTarget) {
        await trx
          .prepare(
            "INSERT INTO meal_slots (id, plan_id, date, slot, label, kcal_target, protein_target, max_minutes, portable, locked) VALUES (?,?,?,?,?,?,?,?,?,0)",
          )
          .run(
            snackTarget.id,
            first.plan_id,
            date,
            "snack",
            snackTarget.label,
            snackTarget.kcalTarget,
            snackTarget.proteinTarget,
            snackTarget.maxMinutes,
            snackTarget.portable ? 1 : 0,
          );
        const pick = ctx.recipes.find((r) => fitsSlot(r, snackTarget, ctx));
        if (pick) {
          const solved = solveMeal(solver, pick.ingredients, {
            kcal: snackTarget.kcalTarget,
            kcalTolerance: 25,
            proteinMin: snackTarget.proteinTarget,
          });
          const instId = randomUUID();
          await trx
            .prepare(
              "INSERT INTO recipe_instances (id, recipe_id, user_id, grams, kcal, protein_g, carb_g, fat_g, fiber_g, cost_cents, solver_status, solver_trace, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .run(
              instId,
              pick.id,
              (await currentUserId()),
              JSON.stringify(solved.grams),
              solved.totals.kcal,
              solved.totals.protein,
              solved.totals.carb,
              solved.totals.fat,
              solved.totals.fiber,
              null,
              solved.status,
              null,
              now,
            );
          await trx
            .prepare("INSERT INTO meals (id, slot_id, recipe_instance_id, state, explanation, cooked_at) VALUES (?,?,?,?,NULL,NULL)")
            .run(randomUUID(), snackTarget.id, instId, "planned");
          created++;
        }
      }

      for (const row of existing) {
        if (row.state === "cooked" || !row.meal_id || !row.recipe_id) continue;
        if (snackOff && row.slot === "snack") continue;
        const target = dayTargets.get(row.slot as SlotKind);
        if (!target) continue;

        // Les nouvelles bornes du créneau, telles que le contexte les impose.
        await trx
          .prepare("UPDATE meal_slots SET kcal_target = ?, protein_target = ? WHERE id = ?")
          .run(target.kcalTarget, target.proteinTarget, row.id);

        const slot = { ...target, id: row.id, maxMinutes: row.max_minutes, portable: row.portable === 1 };
        let recipe = recipeById.get(row.recipe_id);
        if (!recipe) continue;

        // On ne change de plat que s'il ne tient plus : sinon on garde le sien.
        if (!fitsSlot(recipe, slot, ctx)) {
          const better = ctx.recipes.find((r) => fitsSlot(r, slot, ctx));
          if (better) {
            recipe = better;
            swapped++;
          }
        }

        const solved = solveMeal(solver, recipe.ingredients, {
          kcal: slot.kcalTarget,
          kcalTolerance: 25,
          proteinMin: slot.proteinTarget,
          animalMinG: ctx.mainSlots.has(slot.slot) ? ctx.meatPerMainMealG : 0,
        });
        const instId = randomUUID();
        await trx
          .prepare(
            "INSERT INTO recipe_instances (id, recipe_id, user_id, grams, kcal, protein_g, carb_g, fat_g, fiber_g, cost_cents, solver_status, solver_trace, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            instId,
            recipe.id,
            (await currentUserId()),
            JSON.stringify(solved.grams),
            solved.totals.kcal,
            solved.totals.protein,
            solved.totals.carb,
            solved.totals.fat,
            solved.totals.fiber,
            null,
            solved.status,
            null,
            now,
          );
        await trx.prepare("UPDATE meals SET recipe_instance_id = ? WHERE id = ?").run(instId, row.meal_id);
        retargeted++;
      }
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, context, mode: "adjust", retargeted, swapped, created });
}
