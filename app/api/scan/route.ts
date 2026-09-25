import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { rawDb } from "@/db/client";
import { lookupBarcode } from "@/server/off-service";

const barcodeRe = /^[0-9]{6,14}$/;

/** Lecture : ce qu'est ce code-barres, et à quel aliment il correspond chez moi. */
export async function GET(request: Request): Promise<NextResponse> {
  const barcode = new URL(request.url).searchParams.get("barcode")?.trim() ?? "";
  if (!barcodeRe.test(barcode)) return NextResponse.json({ error: "code-barres invalide" }, { status: 400 });

  const product = await lookupBarcode(barcode);
  const db = rawDb();
  const concepts = await db
    .prepare("SELECT id, name_en, category FROM food_concepts ORDER BY category, name_en")
    .all() as unknown as { id: string; name_en: string; category: string }[];

  if (!product) {
    return NextResponse.json({
      found: false,
      barcode,
      concepts: concepts.map((c) => ({ id: c.id, name: c.name_en, category: c.category })),
    });
  }

  return NextResponse.json({
    found: true,
    product,
    concepts: concepts.map((c) => ({ id: c.id, name: c.name_en, category: c.category })),
  });
}

const postSchema = z.object({
  barcode: z.string().regex(barcodeRe),
  conceptId: z.string(),
  grams: z.number().min(1).max(20000),
  priceCents: z.number().int().min(1).max(200000).optional(),
  /** Rentré dans le stock, ou mangé tout de suite hors plan. */
  destination: z.enum(["stock", "eaten"]).default("stock"),
  name: z.string().max(120).optional(),
  /** Valeurs relevées sur l'étiquette quand aucune base ne les avait. */
  kcal100: z.number().min(0).max(950).optional(),
  protein100: z.number().min(0).max(100).optional(),
});

/**
 * Confirmation : ce code-barres EST cet aliment. On mémorise le lien, on entre
 * le lot en stock, et si un prix est donné il devient le prix de référence
 * pour cet aliment. La fois d'après, le même scan ne pose plus de question.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { barcode, conceptId, grams, priceCents, destination, name, kcal100, protein100 } = parsed.data;
  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);

  const concept = await db
    .prepare("SELECT id, category, perishability_days, freezable FROM food_concepts WHERE id = ?")
    .get(conceptId) as
    | { id: string; category: string; perishability_days: number; freezable: number }
    | undefined;
  if (!concept) return NextResponse.json({ error: "aliment inconnu" }, { status: 404 });

  const known = await db.prepare("SELECT barcode FROM off_products WHERE barcode = ?").get(barcode);

  try {
    await db.tx(async (trx) => {
      if (known) {
        await trx.prepare(
          `UPDATE off_products SET concept_id = ?, confirmed = 1, scan_count = scan_count + 1,
             last_scanned_at = ?, quantity_g = COALESCE(quantity_g, ?), price_cents = COALESCE(?, price_cents)
           WHERE barcode = ?`,
        ).run(conceptId, now, grams, priceCents ?? null, barcode);
      } else {
        // Produit absent d'Open Food Facts : on garde quand même sa fiche locale.
        await trx.prepare(
          `INSERT INTO off_products (barcode, concept_id, brand, name, quantity_g, kcal_100, protein_100,
             carb_100, fat_100, fiber_100, salt_100, image_url, raw, price_cents, scan_count, last_scanned_at, confirmed, fetched_at)
           VALUES (?,?,NULL,?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,1,?,1,?)`,
        ).run(barcode, conceptId, name ?? conceptId, grams, priceCents ?? null, now, now);
      }

      if (destination === "stock") {
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
        await trx.prepare(
          `INSERT INTO pantry_items (id, user_id, location_id, concept_id, barcode, quantity_g, initial_g,
             opened_at, purchased_at, best_before, frozen, portioned_from_id, confidence, updated_at)
           VALUES (?,?,?,?,?,?,?,NULL,?,?,?,NULL,1,?)`,
        ).run(
          itemId,
          (await currentUserId()),
          `${(await currentUserId())}:${kind}`,
          conceptId,
          barcode,
          grams,
          grams,
          now,
          best.toISOString().slice(0, 10),
          kind === "freezer" ? 1 : 0,
          now,
        );
        await trx.prepare("INSERT INTO inventory_events (item_id, kind, delta_g, reason_ref, at) VALUES (?,?,?,?,?)").run(
          itemId,
          "purchase",
          grams,
          `scan:${barcode}`,
          now,
        );
      }

      if (priceCents) {
        // Un prix lu sur l'étiquette vaut mieux que ma référence nationale.
        await trx.prepare(
          "INSERT INTO price_observations (concept_id, barcode, store_id, price_cents, quantity_g, cents_per_kg, at, source) VALUES (?,?,?,?,?,?,?,?)",
        ).run(
          conceptId,
          barcode,
          "store:intermarche-vouille",
          priceCents,
          grams,
          Math.round((priceCents / grams) * 1000),
          now,
          "scan",
        );
      }
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, conceptId, grams, destination });
}
