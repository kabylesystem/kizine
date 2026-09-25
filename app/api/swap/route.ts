import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { rawDb } from "@/db/client";
import { buildContext } from "@/server/plan-service";
import { alternativesFor, planWeek } from "@/core/planner";
import { loadHighs } from "@/core/highs";
import { solveMeal } from "@/core/solver";
import { join } from "node:path";

const schema = z.object({
  slotId: z.string(),
  recipeId: z.string().optional(),
  /** Remplacer le plat sur TOUS ses créneaux de la semaine, par le même autre plat. */
  wholeRecipe: z.boolean().optional(),
});

/** Tous les créneaux non cuisinés qui servent ce plat, pour le changer d'un coup. */
export async function slotsForRecipe(weekStart: string, recipeId: string): Promise<string[]> {
  return (
    await rawDb()
      .prepare(
        `SELECT s.id FROM meal_slots s
         JOIN meal_plans p ON p.id = s.plan_id
         JOIN meals m ON m.slot_id = s.id
         JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
         WHERE p.user_id = ? AND p.week_start = ? AND ri.recipe_id = ? AND m.state != 'cooked'`,
      )
      .all((await currentUserId()), weekStart, recipeId) as unknown as { id: string }[]
  ).map((r) => r.id);
}

/**
 * « Je ne veux pas ça » : on regénère UN créneau en gardant tout le reste.
 * Le refus est enregistré, il compte autant qu'une note.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { slotId, recipeId } = parsed.data;
  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);

  const slotRow = await db
    .prepare(
      `SELECT s.id, s.plan_id, p.week_start, p.seed, ri.recipe_id AS current_recipe, m.id AS meal_id
       FROM meal_slots s
       JOIN meal_plans p ON p.id = s.plan_id
       LEFT JOIN meals m ON m.slot_id = s.id
       LEFT JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       WHERE s.id = ?`,
    )
    .get(slotId) as
    | { id: string; plan_id: string; week_start: string; seed: number; current_recipe: string | null; meal_id: string | null }
    | undefined;
  if (!slotRow) return NextResponse.json({ error: "créneau introuvable" }, { status: 404 });

  const { ctx } = await buildContext(slotRow.week_start, slotRow.seed);
  const currentMeals = await db
    .prepare(
      `SELECT s.id AS slot_id, ri.recipe_id, ri.kcal, ri.protein_g, ri.carb_g, ri.fat_g, ri.fiber_g, m.explanation
       FROM meal_slots s JOIN meals m ON m.slot_id = s.id JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       WHERE s.plan_id = ?`,
    )
    .all(slotRow.plan_id) as unknown as Record<string, unknown>[];

  const plan = {
    meals: currentMeals.map((r) => ({
      slotId: String(r["slot_id"]),
      recipeId: String(r["recipe_id"]),
      score: 0,
      breakdown: r["explanation"] ? (JSON.parse(String(r["explanation"])) as Record<string, number>) : {},
      estimate: {
        kcal: Number(r["kcal"]),
        protein: Number(r["protein_g"]),
        carb: Number(r["carb_g"]),
        fat: Number(r["fat_g"]),
        fiber: Number(r["fiber_g"] ?? 0),
      },
    })),
    score: 0,
    penalties: { orphan: 0, variety: 0, budget: 0 },
    unfilled: [],
  };

  // Ce qu'il a déjà refusé cette semaine ne revient pas, et un plat déjà
  // présent ailleurs dans la semaine n'est pas « autre chose ».
  const refusedRows = (await db
    .prepare(
      `SELECT DISTINCT subject_id FROM swipe_events
       WHERE user_id = ? AND subject_type = 'dish' AND verdict = 'refused' AND at > ?`,
    )
    .all(await currentUserId(), now - 7 * 86400)) as unknown as { subject_id: string }[];
  const refused = new Set(refusedRows.map((r) => String(r.subject_id)));
  if (slotRow.current_recipe) refused.add(slotRow.current_recipe);
  const inWeek = new Set(plan.meals.map((m) => m.recipeId));

  const ranked = alternativesFor(ctx, plan, slotId, 40);
  const fresh = ranked.filter((a) => !refused.has(a.recipeId) && !inWeek.has(a.recipeId));
  const alts = fresh.length > 0 ? fresh : ranked.filter((a) => !refused.has(a.recipeId));
  const chosenId = recipeId ?? alts[0]?.recipeId;
  if (!chosenId) return NextResponse.json({ error: "aucune alternative" }, { status: 409 });

  const chosen = alts.find((a) => a.recipeId === chosenId) ?? alts[0]!;
  const recipe = ctx.recipes.find((r) => r.id === chosen.recipeId);
  const slot = ctx.slots.find((s) => s.id === slotId);
  if (!recipe || !slot) return NextResponse.json({ error: "données incohérentes" }, { status: 500 });

  const targets =
    parsed.data.wholeRecipe && slotRow.current_recipe
      ? await slotsForRecipe(slotRow.week_start, slotRow.current_recipe)
      : [slotId];

  try {
    await db.tx(async (trx) => {
      if (slotRow.current_recipe) {
        await trx.prepare(
          `INSERT INTO dish_ratings (user_id, recipe_id, elo, duels, stated, revealed, cooked_count, skipped_count, updated_at)
           VALUES (?,?,1500,0,NULL,NULL,0,1,?)
           ON CONFLICT(user_id, recipe_id) DO UPDATE SET skipped_count = skipped_count + 1, updated_at = ?`,
        ).run((await currentUserId()), slotRow.current_recipe, now, now);
        await trx.prepare(
          "INSERT INTO swipe_events (user_id, subject_type, subject_id, verdict, ms, round, at) VALUES (?,?,?,?,?,?,?)",
        ).run((await currentUserId()), "dish", slotRow.current_recipe, "refused", null, "plan", now);
      }
      // Un créneau, ou tous ceux du plat refusé : même remplaçant partout.
      // Chaque créneau a sa propre cible, donc le solveur tourne pour chacun :
      // une estimation au milieu des bornes faisait dériver la journée de 400 kcal.
      const solver = await loadHighs(join(process.cwd(), "node_modules", "highs", "build"));
      const slotById = new Map(ctx.slots.map((x) => [x.id, x]));
      for (const target of targets) {
        const targetSlot = slotById.get(target) ?? slot;
        const solved = solveMeal(solver, recipe.ingredients, {
          kcal: targetSlot.kcalTarget,
          kcalTolerance: 25,
          proteinMin: targetSlot.proteinTarget,
          animalMinG: ctx.mainSlots.has(targetSlot.slot) ? ctx.meatPerMainMealG : 0,
        });
        await trx.prepare("DELETE FROM meals WHERE slot_id = ? AND state != 'cooked'").run(target);
        const instId = randomUUID();
        await trx.prepare(
          "INSERT INTO recipe_instances (id, recipe_id, user_id, grams, kcal, protein_g, carb_g, fat_g, fiber_g, cost_cents, solver_status, solver_trace, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(instId, recipe.id, (await currentUserId()), JSON.stringify(solved.grams), solved.totals.kcal, solved.totals.protein, solved.totals.carb, solved.totals.fat, solved.totals.fiber, null, solved.status, JSON.stringify(chosen.breakdown), now);
        await trx.prepare("INSERT INTO meals (id, slot_id, recipe_instance_id, state, explanation, cooked_at) VALUES (?,?,?,?,?,?)").run(
          randomUUID(),
          target,
          instId,
          "planned",
          JSON.stringify(chosen.breakdown),
          null,
        );
      }
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recipeId: chosen.recipeId, alternatives: alts });
}
