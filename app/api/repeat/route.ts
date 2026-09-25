import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rawDb } from "@/db/client";
import { buildContext } from "@/server/plan-service";
import { alternativesFor } from "@/core/planner";
import { loadHighs } from "@/core/highs";
import { solveMeal } from "@/core/solver";
import type { PlannerRecipe, PlannerSlot } from "@/core/planner-types";

const schema = z.object({
  recipeId: z.string(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  times: z.number().int().min(1).max(7),
});

interface MealRow {
  slot_id: string;
  date: string;
  slot: string;
  recipe_id: string;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  fiber_g: number | null;
  state: string;
  explanation: string | null;
}

/**
 * « Celui-là, je le mange deux ou trois fois cette semaine. » On pose le même
 * plat sur d'autres créneaux du même type, sur des jours où il n'est pas déjà,
 * sans toucher à ce qui est validé ou pris dehors. Moins de fois : les
 * occurrences en trop laissent la place à un autre plat.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { recipeId, weekStart, times } = parsed.data;
  const userId = await currentUserId();
  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);

  const planRow = (await db
    .prepare("SELECT id, seed FROM meal_plans WHERE user_id = ? AND week_start = ?")
    .get(userId, weekStart)) as { id: string; seed: number } | undefined;
  if (!planRow) return NextResponse.json({ error: "semaine introuvable" }, { status: 404 });

  const meals = (await db
    .prepare(
      `SELECT s.id AS slot_id, s.date, s.slot, ri.recipe_id, ri.kcal, ri.protein_g, ri.carb_g, ri.fat_g, ri.fiber_g, m.state, m.explanation
       FROM meal_slots s JOIN meals m ON m.slot_id = s.id JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       WHERE s.plan_id = ? ORDER BY s.date`,
    )
    .all(planRow.id)) as unknown as MealRow[];

  const mine = meals.filter((m) => m.recipe_id === recipeId && m.state !== "cooked");
  if (mine.length === 0) return NextResponse.json({ error: "plat absent de la semaine" }, { status: 404 });
  if (mine.length === times) return NextResponse.json({ ok: true, times });

  const { ctx } = await buildContext(weekStart, planRow.seed);
  const recipe = ctx.recipes.find((r) => r.id === recipeId);
  if (!recipe) return NextResponse.json({ error: "plat indisponible" }, { status: 409 });
  const slotById = new Map(ctx.slots.map((s) => [s.id, s]));

  const plan = {
    meals: meals.map((r) => ({
      slotId: r.slot_id,
      recipeId: r.recipe_id,
      score: 0,
      breakdown: r.explanation ? (JSON.parse(r.explanation) as Record<string, number>) : {},
      estimate: {
        kcal: Number(r.kcal),
        protein: Number(r.protein_g),
        carb: Number(r.carb_g),
        fat: Number(r.fat_g),
        fiber: Number(r.fiber_g ?? 0),
      },
    })),
    score: 0,
    penalties: { orphan: 0, variety: 0, budget: 0 },
    unfilled: [],
  };

  const kinds = new Set(mine.map((m) => m.slot));
  const dates = new Set(mine.map((m) => m.date));

  const changes: { slot: PlannerSlot; recipe: PlannerRecipe; breakdown: Record<string, number> }[] = [];
  if (times > mine.length) {
    for (const c of meals) {
      if (changes.length >= times - mine.length) break;
      if (!kinds.has(c.slot) || dates.has(c.date) || c.state !== "planned" || c.recipe_id === recipeId) continue;
      const slot = slotById.get(c.slot_id);
      if (!slot) continue;
      changes.push({ slot, recipe, breakdown: { repeat: 1 } });
      dates.add(c.date);
    }
    if (changes.length === 0) return NextResponse.json({ error: "aucun créneau libre du même type" }, { status: 409 });
  } else {
    const inWeek = new Set(meals.map((m) => m.recipe_id));
    const drop = [...mine].sort((a, b) => b.date.localeCompare(a.date)).slice(0, mine.length - times);
    for (const d of drop) {
      const slot = slotById.get(d.slot_id);
      if (!slot) continue;
      // Un plat qu'on n'a pas encore cette semaine, sinon n'importe quel autre :
      // une petite cuisine peut n'avoir que trois déjeuners possibles.
      const ranked = alternativesFor(ctx, plan, d.slot_id, 40);
      const alt = ranked.find((a) => !inWeek.has(a.recipeId)) ?? ranked.find((a) => a.recipeId !== recipeId);
      const replacement = alt ? ctx.recipes.find((r) => r.id === alt.recipeId) : undefined;
      if (!alt || !replacement) continue;
      inWeek.add(alt.recipeId);
      changes.push({ slot, recipe: replacement, breakdown: alt.breakdown });
    }
    if (changes.length === 0) return NextResponse.json({ error: "aucune alternative" }, { status: 409 });
  }

  try {
    const solver = await loadHighs(join(process.cwd(), "node_modules", "highs", "build"));
    await db.tx(async (trx) => {
      for (const ch of changes) {
        const solved = solveMeal(solver, ch.recipe.ingredients, {
          kcal: ch.slot.kcalTarget,
          kcalTolerance: 25,
          proteinMin: ch.slot.proteinTarget,
          animalMinG: ctx.mainSlots.has(ch.slot.slot) ? ctx.meatPerMainMealG : 0,
        });
        await trx.prepare("DELETE FROM meals WHERE slot_id = ? AND state != 'cooked'").run(ch.slot.id);
        const instId = randomUUID();
        await trx
          .prepare(
            "INSERT INTO recipe_instances (id, recipe_id, user_id, grams, kcal, protein_g, carb_g, fat_g, fiber_g, cost_cents, solver_status, solver_trace, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            instId,
            ch.recipe.id,
            userId,
            JSON.stringify(solved.grams),
            solved.totals.kcal,
            solved.totals.protein,
            solved.totals.carb,
            solved.totals.fat,
            solved.totals.fiber,
            null,
            solved.status,
            JSON.stringify(ch.breakdown),
            now,
          );
        await trx
          .prepare("INSERT INTO meals (id, slot_id, recipe_instance_id, state, explanation, cooked_at) VALUES (?,?,?,?,?,?)")
          .run(randomUUID(), ch.slot.id, instId, "planned", JSON.stringify(ch.breakdown), null);
      }
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, times: times > mine.length ? mine.length + changes.length : times });
}
