import { currentUserId } from "@/server/auth";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rawDb } from "@/db/client";

import { buildContext } from "./plan-service";
import { planWeek } from "@/core/planner";
import { loadHighs } from "@/core/highs";
import { solveMeal } from "@/core/solver";

/**
 * Remplace un sous-ensemble de créneaux sans toucher au reste de la semaine.
 * Utilisé quand une contrainte dure change en cours de route : un aliment banni
 * doit disparaître des plats déjà planifiés, sinon il reste sur la liste de courses.
 */
export async function replanSlots(slotIds: string[]): Promise<number> {
  if (slotIds.length === 0) return 0;
  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);

  const plans = await db
    .prepare(
      `SELECT DISTINCT p.id, p.week_start, p.seed FROM meal_plans p
       JOIN meal_slots s ON s.plan_id = p.id
       WHERE s.id IN (${slotIds.map(() => "?").join(",")})`,
    )
    .all(...slotIds) as unknown as { id: string; week_start: string; seed: number }[];

  let replaced = 0;
  for (const plan of plans) {
    const target = new Set(
      (
        await db
          .prepare(
            `SELECT id FROM meal_slots WHERE plan_id = ? AND id IN (${slotIds.map(() => "?").join(",")})`,
          )
          .all(plan.id, ...slotIds) as unknown as { id: string }[]
      ).map((r) => r.id),
    );
    if (target.size === 0) continue;

    try {
      await db.tx(async (trx) => {
        for (const id of target) await trx.prepare("DELETE FROM meals WHERE slot_id = ?").run(id);
      });
    } catch (err) {
      throw err;
    }

    const { ctx } = await buildContext(plan.week_start, Math.floor(Math.random() * 1e9));
    const keep = new Map(
      (
        await db
          .prepare(
            `SELECT s.id AS slot_id, ri.recipe_id FROM meal_slots s
             JOIN meals m ON m.slot_id = s.id
             JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
             WHERE s.plan_id = ?`,
          )
          .all(plan.id) as unknown as { slot_id: string; recipe_id: string }[]
      ).map((c) => [c.slot_id, c.recipe_id]),
    );

    const fresh = new Map(
      (
        await db
          .prepare("SELECT id, max_minutes, portable FROM meal_slots WHERE plan_id = ?")
          .all(plan.id) as unknown as { id: string; max_minutes: number; portable: number }[]
      ).map((r) => [r.id, r]),
    );

    const lockedCtx = {
      ...ctx,
      slots: ctx.slots.map((s) => {
        const f = fresh.get(s.id);
        const withDb = f ? { ...s, maxMinutes: f.max_minutes, portable: f.portable === 1 } : s;
        return keep.has(s.id) && !target.has(s.id)
          ? { ...withDb, locked: true, lockedRecipeId: keep.get(s.id) }
          : withDb;
      }),
    };
    const built = planWeek(lockedCtx);

    const solver = await loadHighs(join(process.cwd(), "node_modules", "highs", "build"));
    const recipeById = new Map(ctx.recipes.map((r) => [r.id, r]));
    const slotById = new Map(lockedCtx.slots.map((s) => [s.id, s]));

    try {
      await db.tx(async (trx) => {
        const instStmt = trx.prepare(
          "INSERT INTO recipe_instances (id, recipe_id, user_id, grams, kcal, protein_g, carb_g, fat_g, fiber_g, cost_cents, solver_status, solver_trace, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        );
        const mealStmt = trx.prepare(
          "INSERT INTO meals (id, slot_id, recipe_instance_id, state, explanation, cooked_at) VALUES (?,?,?,?,?,?)",
        );
        for (const meal of built.meals) {
          if (!target.has(meal.slotId)) continue;
          const recipe = recipeById.get(meal.recipeId);
          const slot = slotById.get(meal.slotId);
          if (!recipe || !slot) continue;
          const solved = solveMeal(solver, recipe.ingredients, {
            kcal: slot.kcalTarget,
            kcalTolerance: 25,
            proteinMin: slot.proteinTarget,
            animalMinG: ctx.mainSlots.has(slot.slot) ? ctx.meatPerMainMealG : 0,
          });
          const instId = randomUUID();
          await instStmt.run(
            instId,
            meal.recipeId,
            (await currentUserId()),
            JSON.stringify(solved.grams),
            solved.totals.kcal,
            solved.totals.protein,
            solved.totals.carb,
            solved.totals.fat,
            solved.totals.fiber,
            null,
            solved.status,
            JSON.stringify(meal.breakdown),
            now,
          );
          await mealStmt.run(randomUUID(), meal.slotId, instId, "planned", JSON.stringify(meal.breakdown), null);
          replaced++;
        }
      });
    } catch (err) {
      throw err;
    }
  }
  return replaced;
}

/** Créneaux non cuisinés dont la recette contient cet aliment sans qu'il soit optionnel. */
export async function slotsUsing(conceptId: string): Promise<string[]> {
  const db = rawDb();
  return (
    await db
      .prepare(
        `SELECT DISTINCT s.id FROM meal_slots s
         JOIN meals m ON m.slot_id = s.id
         JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
         JOIN recipe_ingredients rg ON rg.recipe_id = ri.recipe_id
         WHERE rg.concept_id = ? AND rg.optional = 0 AND m.state != 'cooked'`,
      )
      .all(conceptId) as unknown as { id: string }[]
  ).map((r) => r.id);
}
