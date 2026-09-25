import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { rawDb } from "@/db/client";
import { DEFAULT_TAU, DEFAULT_IMPACT } from "@/core/fatigue";

const schema = z.object({
  slotId: z.string(),
  grams: z.record(z.string(), z.number()),
  rating: z.number().int().min(1).max(10).optional(),
  portion: z.enum(["hungry", "perfect", "too_much"]).optional(),
});

/**
 * Enregistre un repas cuisiné. Trois effets déterministes :
 * le stock baisse, la fatigue monte, la préférence révélée s'ajuste.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { slotId, grams, rating, portion } = parsed.data;
  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);

  const meal = await db
    .prepare(
      `SELECT m.id, ri.recipe_id, ri.id AS instance_id, s.date
       FROM meals m
       JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       JOIN meal_slots s ON s.id = m.slot_id
       WHERE m.slot_id = ?`,
    )
    .get(slotId) as { id: string; recipe_id: string; instance_id: string; date: string } | undefined;
  if (!meal) return NextResponse.json({ error: "repas introuvable" }, { status: 404 });

  try {
    await db.tx(async (trx) => {
      await trx.prepare("UPDATE meals SET state = 'cooked', cooked_at = ? WHERE id = ?").run(now, meal.id);
      await trx.prepare("UPDATE recipe_instances SET grams = ?, solver_status = 'exact', precision = 'exact' WHERE id = ?").run(
        JSON.stringify(grams),
        meal.instance_id,
      );
      await trx.prepare(
        "INSERT INTO cooking_feedback (meal_id, cooked, rating, would_repeat, effort, portion, note, at) VALUES (?,?,?,?,?,?,?,?)",
      ).run(meal.id, 1, rating ?? null, null, null, portion ?? null, null, now);

      // Stock : on décrémente ce qui existe, du lot le plus proche de la péremption.
      const evStmt = trx.prepare(
        "INSERT INTO inventory_events (item_id, kind, delta_g, reason_ref, at) VALUES (?,?,?,?,?)",
      );
      // Une portion de plat libre : le stock est déjà parti quand la casserole a été faite.
      const stockGrams = meal.recipe_id.startsWith("free:") ? {} : grams;
      for (const [conceptId, needed] of Object.entries(stockGrams)) {
        let remaining = needed;
        const lots = (await trx
          .prepare(
            "SELECT id, quantity_g FROM pantry_items WHERE user_id = ? AND concept_id = ? AND quantity_g > 0 ORDER BY COALESCE(best_before, '9999-12-31')",
          )
          .all(await currentUserId(), conceptId)) as unknown as { id: string; quantity_g: number }[];
        for (const lot of lots) {
          if (remaining <= 0) break;
          const take = Math.min(lot.quantity_g, remaining);
          await trx.prepare("UPDATE pantry_items SET quantity_g = quantity_g - ?, updated_at = ? WHERE id = ?").run(
            take,
            now,
            lot.id,
          );
          await evStmt.run(lot.id, "cook", -take, meal.id, now);
          remaining -= take;
        }
      }

      // Fatigue : exposition du plat, de la cuisine, des protéines et des profils de saveur.
      const recipe = (await trx.prepare("SELECT cuisine, flavor_profiles, techniques FROM recipes WHERE id = ?")
        .get(meal.recipe_id)) as { cuisine: string; flavor_profiles: string; techniques: string };
      const proteins = (await trx.prepare("SELECT concept_id FROM recipe_ingredients WHERE recipe_id = ? AND role = 'protein_core'")
        .all(meal.recipe_id)) as unknown as { concept_id: string }[];

      const bump = trx.prepare(
        `INSERT INTO fatigue_states (user_id, entity_type, entity_id, level, last_exposure_at, tau_days)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET
           level = level * exp(-(? - COALESCE(last_exposure_at, ?)) / 86400.0 / tau_days) + ?,
           last_exposure_at = ?`,
      );
      const record = async (type: keyof typeof DEFAULT_TAU, id: string) => {
        await bump.run(
          (await currentUserId()),
          type,
          id,
          DEFAULT_IMPACT[type],
          now,
          DEFAULT_TAU[type],
          now,
          now,
          DEFAULT_IMPACT[type],
          now,
        );
      };
      await record("dish", meal.recipe_id);
      await record("cuisine", recipe.cuisine);
      for (const p of proteins) await record("protein", p.concept_id);
      for (const f of JSON.parse(recipe.flavor_profiles) as string[]) await record("flavor", f);
      for (const t of JSON.parse(recipe.techniques) as string[]) await record("technique", t);

      await trx.prepare(
        `INSERT INTO dish_ratings (user_id, recipe_id, elo, duels, stated, revealed, cooked_count, skipped_count, updated_at)
         VALUES (?,?,1500,0,NULL,?,1,0,?)
         ON CONFLICT(user_id, recipe_id) DO UPDATE SET
           cooked_count = cooked_count + 1,
           revealed = COALESCE(?, revealed),
           updated_at = ?`,
      ).run((await currentUserId()), meal.recipe_id, rating ?? null, now, rating ?? null, now);
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
