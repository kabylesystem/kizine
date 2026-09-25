import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rawDb } from "@/db/client";
import { buildContext } from "@/server/plan-service";
import { loadHighs } from "@/core/highs";
import { solveMeal } from "@/core/solver";

const schema = z.object({ slotId: z.string(), targetSlotId: z.string() });

/**
 * Déplacer un plat d'un jour à l'autre. Les deux créneaux échangent leur plat :
 * la semaine garde le même ensemble, donc la liste de courses ne bouge pas.
 * Les grammes sont recalculés, parce qu'un midi et un soir n'ont pas la même cible.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { slotId, targetSlotId } = parsed.data;
  if (slotId === targetSlotId) return NextResponse.json({ ok: true, moved: 0 });

  const db = rawDb();
  const rows = (await db
    .prepare(
      `SELECT s.id AS slot_id, s.plan_id, p.week_start, p.seed, m.id AS meal_id, m.state, ri.recipe_id
       FROM meal_slots s
       JOIN meal_plans p ON p.id = s.plan_id
       JOIN meals m ON m.slot_id = s.id
       JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       WHERE s.id IN (?, ?)`,
    )
    .all(slotId, targetSlotId)) as {
    slot_id: string;
    plan_id: string;
    week_start: string;
    seed: number;
    meal_id: string;
    state: string;
    recipe_id: string;
  }[];

  const from = rows.find((r) => r.slot_id === slotId);
  const to = rows.find((r) => r.slot_id === targetSlotId);
  if (!from || !to) return NextResponse.json({ error: "créneau introuvable" }, { status: 404 });
  if (from.state === "cooked" || to.state === "cooked") {
    return NextResponse.json({ error: "déjà cuisiné" }, { status: 409 });
  }

  const { ctx } = await buildContext(from.week_start, from.seed);
  const slotById = new Map(ctx.slots.map((s) => [s.id, s]));
  const recipeById = new Map(ctx.recipes.map((r) => [r.id, r]));
  const solver = await loadHighs(join(process.cwd(), "node_modules", "highs", "build"));

  const pairs = [
    { slotId, recipeId: to.recipe_id, mealId: from.meal_id },
    { slotId: targetSlotId, recipeId: from.recipe_id, mealId: to.meal_id },
  ];

  const now = Math.floor(Date.now() / 1000);
  try {
    await db.tx(async (trx) => {
      const insert = trx.prepare(
        "INSERT INTO recipe_instances (id, recipe_id, user_id, grams, kcal, protein_g, carb_g, fat_g, fiber_g, cost_cents, solver_status, solver_trace, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      );
      for (const pair of pairs) {
        const slot = slotById.get(pair.slotId);
        const recipe = recipeById.get(pair.recipeId);
        if (!slot || !recipe) continue;
        const solved = solveMeal(solver, recipe.ingredients, {
          kcal: slot.kcalTarget,
          kcalTolerance: 25,
          proteinMin: slot.proteinTarget,
          animalMinG: ctx.mainSlots.has(slot.slot) ? ctx.meatPerMainMealG : 0,
        });
        const instId = randomUUID();
        await insert.run(
          instId,
          pair.recipeId,
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
        await trx.prepare("UPDATE meals SET recipe_instance_id = ? WHERE id = ?").run(instId, pair.mealId);
      }
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, moved: 2 });
}
