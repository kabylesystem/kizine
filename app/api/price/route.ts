import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/db/client";

const schema = z.object({
  conceptId: z.string(),
  priceCents: z.number().int().min(1).max(200000),
  quantityG: z.number().min(1).max(20000),
  store: z.string().max(60).optional(),
});

/**
 * Un prix relevé par default-user écrase la référence : c'est son magasin, sa ville, ses promos.
 * La référence française ne sert qu'à démarrer.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { conceptId, priceCents, quantityG, store } = parsed.data;
  const db = rawDb();

  const known = await db.prepare("SELECT id FROM food_concepts WHERE id = ?").get(conceptId);
  if (!known) return NextResponse.json({ error: "aliment inconnu" }, { status: 404 });

  // Son magasin par défaut, celui où il fait vraiment ses courses.
  let storeId: string | null = "store:intermarche-vouille";
  if (store) {
    storeId = `store:${store.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    await db.prepare("INSERT OR IGNORE INTO stores (id, name, chain, city, osm_ref) VALUES (?,?,?,?,?)").run(
      storeId,
      store,
      null,
      null,
      null,
    );
  }

  const centsPerKg = Math.round((priceCents / quantityG) * 1000);
  await db.prepare(
    "INSERT INTO price_observations (concept_id, barcode, store_id, price_cents, quantity_g, cents_per_kg, at, source) VALUES (?,?,?,?,?,?,?,?)",
  ).run(conceptId, null, storeId, priceCents, quantityG, centsPerKg, Math.floor(Date.now() / 1000), "manual");

  return NextResponse.json({ ok: true, centsPerKg });
}
