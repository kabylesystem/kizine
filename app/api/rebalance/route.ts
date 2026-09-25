import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rawDb } from "@/db/client";
import { buildContext } from "@/server/plan-service";
import { loadHighs } from "@/core/highs";
import { solveMeal } from "@/core/solver";

const schema = z.object({
  slotId: z.string(),
  /** Calories à ajouter sur ce créneau pour combler le trou de la journée. */
  addKcal: z.number().int().min(-2000).max(2000),
});

/**
 * Rattraper un repas sauté sur un repas encore à faire.
 *
 * On ne change pas le plat : on relance le solveur sur la MÊME recette avec une
 * cible plus haute. Les bornes hautes de chaque ingrédient tiennent toujours,
 * donc l'assiette reste mangeable ; si elle ne peut pas absorber tout le trou,
 * on le dit au lieu de faire semblant.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { slotId, addKcal } = parsed.data;
  const db = rawDb();

  const row = (await db
    .prepare(
      `SELECT s.id, s.date, p.week_start, p.seed, m.id AS meal_id, m.state, ri.recipe_id, ri.kcal
       FROM meal_slots s JOIN meal_plans p ON p.id = s.plan_id
       JOIN meals m ON m.slot_id = s.id JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       WHERE s.id = ?`,
    )
    .get(slotId)) as
    | { id: string; date: string; week_start: string; seed: number; meal_id: string; state: string; recipe_id: string; kcal: number }
    | undefined;
  if (!row) return NextResponse.json({ error: "repas introuvable" }, { status: 404 });
  if (row.state === "cooked") return NextResponse.json({ error: "déjà cuisiné" }, { status: 409 });

  const { ctx } = await buildContext(row.week_start, row.seed);
  const slot = ctx.slots.find((s) => s.id === slotId);
  const recipe = ctx.recipes.find((r) => r.id === row.recipe_id);
  if (!slot || !recipe) return NextResponse.json({ error: "créneau hors semaine" }, { status: 404 });

  const wanted = Math.max(200, Number(row.kcal) + addKcal);
  const solver = await loadHighs(join(process.cwd(), "node_modules", "highs", "build"));
  const solved = solveMeal(solver, recipe.ingredients, {
    kcal: wanted,
    // Large exprès : on cherche à absorber un trou, pas à viser au gramme.
    kcalTolerance: 80,
    proteinMin: slot.proteinTarget,
    animalMinG: ctx.mainSlots.has(slot.slot) ? ctx.meatPerMainMealG : 0,
  });

  const reached = Math.round(solved.totals.kcal);
  const instId = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  try {
    await db.tx(async (trx) => {
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
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const gained = reached - Math.round(Number(row.kcal));
  return NextResponse.json({
    ok: true,
    title: recipe.title,
    kcal: reached,
    gained,
    // Ce que l'assiette n'a pas pu absorber : dit franchement.
    short: Math.max(0, addKcal - gained),
  });
}
