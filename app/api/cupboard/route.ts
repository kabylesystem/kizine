import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { rawDb } from "@/db/client";

const schema = z.object({
  conceptId: z.string(),
  state: z.enum(["have", "need", "unknown"]),
  grams: z.number().min(1).max(20000).optional(),
});

const DECLARED = "declared";

/**
 * En rayon on répond à une question simple : je l'ai déjà, ou pas.
 * « je l'ai » crée un lot de stock, donc la ligne quitte la liste.
 * « je ne l'ai pas » force la ligne dans les courses même si c'est du placard.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { conceptId, state, grams } = parsed.data;
  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);

  const concept = await db
    .prepare("SELECT id, category, perishability_days, freezable, typical_package_g FROM food_concepts WHERE id = ?")
    .get(conceptId) as
    | { id: string; category: string; perishability_days: number; freezable: number; typical_package_g: number | null }
    | undefined;
  if (!concept) return NextResponse.json({ error: "aliment inconnu" }, { status: 404 });

  try {
    await db.tx(async (trx) => {
      // On repart toujours d'une ardoise propre pour cet aliment.
      const declared = (await trx
        .prepare(
          `SELECT p.id FROM pantry_items p
           JOIN inventory_events e ON e.item_id = p.id
           WHERE p.user_id = ? AND p.concept_id = ? AND e.reason_ref = ?`,
        )
        .all(await currentUserId(), conceptId, DECLARED)) as unknown as { id: string }[];
      for (const d of declared) {
        await trx.prepare("DELETE FROM inventory_events WHERE item_id = ?").run(d.id);
        await trx.prepare("DELETE FROM pantry_items WHERE id = ?").run(d.id);
      }
      await trx.prepare("DELETE FROM pantry_declarations WHERE user_id = ? AND concept_id = ?").run((await currentUserId()), conceptId);

      if (state !== "unknown") {
        await trx.prepare("INSERT INTO pantry_declarations (user_id, concept_id, state, at) VALUES (?,?,?,?)").run(
          (await currentUserId()),
          conceptId,
          state,
          now,
        );
      }

      if (state === "have") {
        const keepDays = concept.perishability_days;
        const kind =
          keepDays <= 10 && ["protein", "dairy", "vegetable", "fruit"].includes(concept.category)
            ? "fridge"
            : concept.freezable === 1 && keepDays <= 5
              ? "freezer"
              : "pantry";
        const best = new Date();
        best.setDate(best.getDate() + Math.min(keepDays, 365));
        const itemId = randomUUID();
        const qty = grams ?? concept.typical_package_g ?? 500;
        await trx.prepare(
          `INSERT INTO pantry_items (id, user_id, location_id, concept_id, barcode, quantity_g, initial_g,
             opened_at, purchased_at, best_before, frozen, portioned_from_id, confidence, updated_at)
           VALUES (?,?,?,?,NULL,?,?,NULL,?,?,?,NULL,?,?)`,
        ).run(
          itemId,
          (await currentUserId()),
          `${(await currentUserId())}:${kind}`,
          conceptId,
          qty,
          qty,
          now,
          best.toISOString().slice(0, 10),
          kind === "freezer" ? 1 : 0,
          // Déclaré de mémoire, pas pesé : le planificateur doit le savoir.
          0.6,
          now,
        );
        await trx.prepare("INSERT INTO inventory_events (item_id, kind, delta_g, reason_ref, at) VALUES (?,?,?,?,?)").run(
          itemId,
          "declared",
          qty,
          DECLARED,
          now,
        );
      }
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, conceptId, state });
}
