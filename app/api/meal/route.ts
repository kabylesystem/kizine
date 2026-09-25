import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rawDb } from "@/db/client";
import { buildContext } from "@/server/plan-service";
import { coveredByStock, fitsSlot } from "@/core/reshuffle";
import { loadHighs } from "@/core/highs";
import { solveMeal } from "@/core/solver";

const schema = z.object({
  slotId: z.string(),
  action: z.enum(["skip", "replace", "undo", "ate"]),
  reason: z.string().max(120).optional(),
});

const REASONS = ["not hungry", "no time", "ate out", "did not fancy it", "it went wrong"];
export const SKIP_REASONS = REASONS;

/**
 * Ce qui arrive à un repas prévu quand la vie s'en mêle : sauté, raté, ou
 * remplacé parce qu'il n'en a pas envie.
 *
 * Le remplacement est la partie délicate : les courses sont déjà faites, donc
 * le nouveau plat ne peut utiliser QUE ce qui est au frigo, et il doit tenir
 * la même cible calorique et protéique. On ne relance pas la semaine, on ne
 * change qu'une case.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { slotId, action, reason } = parsed.data;
  const db = rawDb();

  const row = (await db
    .prepare(
      `SELECT s.id, s.plan_id, p.week_start, p.seed, m.id AS meal_id, m.state, ri.recipe_id
       FROM meal_slots s JOIN meal_plans p ON p.id = s.plan_id
       JOIN meals m ON m.slot_id = s.id JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       WHERE s.id = ?`,
    )
    .get(slotId)) as
    | { id: string; plan_id: string; week_start: string; seed: number; meal_id: string; state: string; recipe_id: string }
    | undefined;
  if (!row) return NextResponse.json({ error: "repas introuvable" }, { status: 404 });

  if (action === "undo") {
    await db.prepare("UPDATE meals SET state = 'planned', skip_reason = NULL WHERE id = ?").run(row.meal_id);
    return NextResponse.json({ ok: true, action });
  }

  // Mangé tel que prévu, sans passer par la cuisine pas à pas : plat connu, pas pesé.
  if (action === "ate") {
    const now = Math.floor(Date.now() / 1000);
    await db.tx(async (trx) => {
      await trx.prepare("UPDATE meals SET state = 'cooked', skip_reason = NULL, cooked_at = ? WHERE id = ?").run(now, row.meal_id);
      await trx
        .prepare("UPDATE recipe_instances SET precision = COALESCE(precision, 'known') WHERE id = (SELECT recipe_instance_id FROM meals WHERE id = ?)")
        .run(row.meal_id);
    });
    return NextResponse.json({ ok: true, action });
  }

  if (action === "skip") {
    await db
      .prepare("UPDATE meals SET state = 'skipped', skip_reason = ? WHERE id = ?")
      .run(reason ?? null, row.meal_id);
    return NextResponse.json({ ok: true, action, reason: reason ?? null });
  }

  // Remplacement : uniquement parmi ce qui est déjà acheté.
  const { ctx } = await buildContext(row.week_start, Math.floor(Math.random() * 1e9));
  const slot = ctx.slots.find((s) => s.id === slotId);
  if (!slot) return NextResponse.json({ error: "créneau hors semaine" }, { status: 404 });

  const stock = new Map<string, number>();
  for (const lot of (await db
    .prepare(
      "SELECT concept_id, SUM(quantity_g) AS g FROM pantry_items WHERE user_id = ? AND quantity_g > 0 GROUP BY concept_id",
    )
    .all((await currentUserId()))) as unknown as { concept_id: string; g: number }[]) {
    stock.set(String(lot.concept_id), Number(lot.g));
  }

  const candidates = ctx.recipes.filter(
    (r) => r.id !== row.recipe_id && fitsSlot(r, slot, ctx) && coveredByStock(r, stock, ctx),
  );
  // À défaut de stock suffisant, on élargit : mieux vaut un plat à acheter
  // qu'une case vide, mais on le dit à l'appelant.
  const fromStock = candidates.length > 0;
  const pool = fromStock ? candidates : ctx.recipes.filter((r) => r.id !== row.recipe_id && fitsSlot(r, slot, ctx));
  if (pool.length === 0) return NextResponse.json({ error: "aucun plat possible" }, { status: 409 });

  const pick = pool[Math.floor(Math.random() * pool.length)]!;
  const solver = await loadHighs(join(process.cwd(), "node_modules", "highs", "build"));
  const solved = solveMeal(solver, pick.ingredients, {
    kcal: slot.kcalTarget,
    kcalTolerance: 25,
    proteinMin: slot.proteinTarget,
    animalMinG: ctx.mainSlots.has(slot.slot) ? ctx.meatPerMainMealG : 0,
  });

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
      await trx.prepare("UPDATE meals SET recipe_instance_id = ?, state = 'planned' WHERE id = ?").run(instId, row.meal_id);
      // Un refus vaut un avis : le plat écarté descend dans le classement.
      await trx
        .prepare(
          `INSERT INTO swipe_events (user_id, subject_type, subject_id, verdict, ms, round, at)
           VALUES (?,?,?,?,?,?,?)`,
        )
        .run((await currentUserId()), "dish", row.recipe_id, "meh", null, "replace", now);
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    action,
    title: pick.title,
    kcal: Math.round(solved.totals.kcal),
    fromStock,
  });
}
