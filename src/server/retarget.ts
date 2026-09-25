import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rawDb } from "@/db/client";
import { currentUserId } from "@/server/auth";
import { buildContext } from "@/server/plan-service";
import { fitsSlot } from "@/core/reshuffle";
import { loadHighs } from "@/core/highs";
import { solveMeal } from "@/core/solver";

interface Row {
  id: string;
  date: string;
  slot: string;
  max_minutes: number;
  portable: number;
  meal_id: string | null;
  state: string | null;
  recipe_id: string | null;
}

/**
 * Les cibles ont changé (calories, protéines, répartition entre les repas) :
 * on recalcule chaque créneau restant de la semaine et on redose les plats
 * déjà choisis, sans en changer un seul tant qu'il tient encore dans sa case.
 */
export async function retargetWeek(weekStart: string): Promise<{ retargeted: number; swapped: number }> {
  const db = rawDb();
  const userId = await currentUserId();
  const plan = (await db
    .prepare("SELECT id, seed FROM meal_plans WHERE user_id = ? AND week_start = ?")
    .get(userId, weekStart)) as { id: string; seed: number } | undefined;
  if (!plan) return { retargeted: 0, swapped: 0 };

  const { ctx } = await buildContext(weekStart, plan.seed);
  const targetById = new Map(ctx.slots.map((s) => [s.id, s]));
  const recipeById = new Map(ctx.recipes.map((r) => [r.id, r]));
  const today = new Date().toISOString().slice(0, 10);

  const rows = (await db
    .prepare(
      `SELECT s.id, s.date, s.slot, s.max_minutes, s.portable, m.id AS meal_id, m.state, ri.recipe_id
       FROM meal_slots s
       LEFT JOIN meals m ON m.slot_id = s.id
       LEFT JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       WHERE s.plan_id = ? AND s.date >= ?`,
    )
    .all(plan.id, today)) as unknown as Row[];

  const solver = await loadHighs(join(process.cwd(), "node_modules", "highs", "build"));
  const now = Math.floor(Date.now() / 1000);
  let retargeted = 0;
  let swapped = 0;

  await db.tx(async (trx) => {
    for (const row of rows) {
      if (row.state === "cooked" || !row.meal_id || !row.recipe_id) continue;
      const target = targetById.get(row.id);
      if (!target) continue;
      await trx
        .prepare("UPDATE meal_slots SET kcal_target = ?, protein_target = ? WHERE id = ?")
        .run(target.kcalTarget, target.proteinTarget, row.id);

      const slot = { ...target, id: row.id, maxMinutes: row.max_minutes, portable: row.portable === 1 };
      let recipe = recipeById.get(row.recipe_id);
      if (!recipe) continue;
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
          userId,
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
  return { retargeted, swapped };
}
