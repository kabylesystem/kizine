import { rawDb } from "@/db/client";
import { OFF_CATEGORY_TO_CONCEPT } from "@/data/off-categories";

const OFF_URL = "https://world.openfoodfacts.org/api/v2/product";
const FIELDS =
  "code,product_name,product_name_fr,product_name_en,brands,quantity,product_quantity,categories_tags,nutriments,image_front_small_url";
const UA = "Kizine/0.1 (personal meal planner)";

export interface ScannedProduct {
  barcode: string;
  name: string;
  brand: string | null;
  packG: number | null;
  kcal100: number | null;
  protein100: number | null;
  carb100: number | null;
  fat100: number | null;
  fiber100: number | null;
  salt100: number | null;
  imageUrl: string | null;
  categories: string[];
  /** D'où vient la fiche : déjà scannée, ou fraîchement récupérée. */
  cached: boolean;
  confirmed: boolean;
  /**
   * D'où viennent les valeurs affichées :
   * - `pack`  : le tableau nutritionnel de la marque, tel qu'il est sur l'emballage
   * - `typed` : ce que default-user a lu lui-même sur l'étiquette
   * - `none`  : personne ne les a, il faut les saisir
   */
  nutritionFrom: "pack" | "typed" | "none";
  /**
   * Valeurs de la table ANSES pour l'aliment correspondant. JAMAIS présentées
   * comme celles du produit : proposées seulement, à accepter ou corriger.
   */
  suggestion: { kcal: number; protein: number; carb: number; fat: number } | null;
  conceptId: string | null;
  /** Pourquoi cet aliment a été proposé : lien validé, rayon, ou nom du produit. */
  matchedBy: "confirmed" | "category" | "name" | "none";
  priceCents: number | null;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Normalise les tags OFF, qui reviennent tantôt en slug anglais, tantôt localisés. */
const normalizeTags = (tags: unknown): string[] =>
  Array.isArray(tags)
    ? tags.map((t) =>
        String(t)
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9:-]/g, ""),
      )
    : [];

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Rapproche le nom du produit d'un de mes aliments, alias compris. */
async function matchByName(name: string): Promise<string | null> {
  const haystack = stripAccents(name);
  if (haystack.length < 3) return null;
  const rows = await rawDb()
    .prepare("SELECT id, name_fr, name_en FROM food_concepts")
    .all() as unknown as { id: string; name_fr: string; name_en: string }[];
  const aliases = await rawDb()
    .prepare("SELECT concept_id, normalized AS alias FROM ingredient_aliases")
    .all() as unknown as { concept_id: string; alias: string }[];

  let best: { id: string; len: number } | null = null;
  const consider = (id: string, term: string) => {
    const t = stripAccents(term);
    if (t.length < 4 || !haystack.includes(t)) return;
    if (!best || t.length > best.len) best = { id, len: t.length };
  };
  for (const r of rows) {
    consider(r.id, r.name_fr);
    consider(r.id, r.name_en);
  }
  for (const a of aliases) consider(a.concept_id, a.alias);
  return best ? (best as { id: string }).id : null;
}

async function guessConcept(categories: string[], name: string): Promise<{ conceptId: string | null; how: "category" | "confirmed" | "name" | "none"; }> {
  // Le tag le plus précis d'abord : OFF les range du plus général au plus précis.
  for (const tag of [...categories].reverse()) {
    const hit = OFF_CATEGORY_TO_CONCEPT[tag];
    if (hit) return { conceptId: hit, how: "category" };
  }
  const byName = await matchByName(name);
  if (byName) return { conceptId: byName, how: "name" };
  return { conceptId: null, how: "none" };
}

async function fromRow(row: Record<string, unknown>): Promise<ScannedProduct> {
  const raw = row.raw ? (JSON.parse(String(row.raw)) as Record<string, unknown>) : {};
  const categories = normalizeTags(raw.categories_tags);
  const stored = row.concept_id ? String(row.concept_id) : null;
  const confirmed = Number(row.confirmed) === 1;
  // Un lien deviné à la volée n'est pas un lien validé : ne pas le présenter comme tel.
  const guess = confirmed ? null : await guessConcept(categories, String(row.name ?? ""));
  const conceptId = confirmed ? stored : (stored ?? guess?.conceptId ?? null);
  return {
    barcode: String(row.barcode),
    name: String(row.name ?? ""),
    brand: row.brand ? String(row.brand) : null,
    packG: num(row.quantity_g),
    kcal100: num(row.kcal_100),
    protein100: num(row.protein_100),
    carb100: num(row.carb_100),
    fat100: num(row.fat_100),
    fiber100: num(row.fiber_100),
    salt100: num(row.salt_100),
    imageUrl: row.image_url ? String(row.image_url) : null,
    categories,
    cached: true,
    confirmed,
    conceptId,
    matchedBy: confirmed ? "confirmed" : (guess?.how ?? "none"),
    nutritionFrom: num(row.kcal_100) === null ? "none" : confirmed ? "typed" : "pack",
    suggestion: null,
    priceCents: num(row.price_cents),
  };
}

/**
 * Open Food Facts limite le débit et renvoie parfois 503. Sans réessai, deux
 * scans d'affilée en magasin échouaient. Trois tentatives avec attente
 * croissante, puis on abandonne proprement.
 */
async function fetchOff(barcode: string): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${OFF_URL}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(9000),
      });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        continue;
      }
      if (!res.ok) return null;
      return (await res.json()) as Record<string, unknown>;
    } catch {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  return null;
}

/**
 * Valeurs de repli quand la fiche existe mais sans nutrition : on prend celles
 * de l'aliment CIQUAL correspondant, c'est-à-dire la table officielle de
 * l'ANSES. Une base collaborative peut avoir un trou ; une table officielle
 * de composition, non.
 */
async function ciqualFallback(conceptId: string | null): Promise<{
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  fiber: number | null;
} | null> {
  if (!conceptId) return null;
  const row = (await rawDb()
    .prepare(
      `SELECT f.kcal_100 AS kcal, f.protein_100 AS protein, f.carb_100 AS carb,
              f.fat_100 AS fat, f.fiber_100 AS fiber
       FROM foods f WHERE f.concept_id = ?
       -- Un aliment n'a pas toujours d'état « cru » : les épices et poudres
       -- n'existent qu'en sec. On prend l'état de base disponible.
       ORDER BY CASE f.state WHEN 'raw' THEN 0 WHEN 'dry' THEN 1 ELSE 2 END LIMIT 1`,
    )
    .get(conceptId)) as
    | { kcal: number; protein: number; carb: number; fat: number; fiber: number | null }
    | undefined;
  return row ?? null;
}

export async function lookupBarcode(barcode: string): Promise<ScannedProduct | null> {
  const db = rawDb();
  const cached = await db.prepare("SELECT * FROM off_products WHERE barcode = ?").get(barcode) as
    | Record<string, unknown>
    | undefined;
  if (cached) return fromRow(cached);

  const payload = await fetchOff(barcode);
  if (!payload || Number(payload.status) !== 1 || !payload.product) return null;

  const p = payload.product as Record<string, unknown>;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const name = String(p.product_name_fr || p.product_name || p.product_name_en || "").trim();
  if (!name) return null;

  const categories = normalizeTags(p.categories_tags);
  const guess = await guessConcept(categories, name);
  const packG = num(p.product_quantity);

  // Ce qui vient de l'emballage, et rien d'autre. Une valeur inventée à partir
  // d'un aliment générique n'est pas la valeur du produit : on préfère un trou
  // assumé, qu'il comble en lisant son étiquette.
  const kcal100 = num(n["energy-kcal_100g"]);
  const protein100 = num(n.proteins_100g);
  const carb100 = num(n.carbohydrates_100g);
  const fat100 = num(n.fat_100g);
  const fiber100 = num(n.fiber_100g);
  const source: ScannedProduct["nutritionFrom"] =
    kcal100 !== null && protein100 !== null ? "pack" : "none";
  const fb = source === "none" ? await ciqualFallback(guess.conceptId) : null;
  const suggestion = fb ? { kcal: fb.kcal, protein: fb.protein, carb: fb.carb, fat: fb.fat } : null;

  await db.prepare(
    `INSERT INTO off_products (barcode, concept_id, brand, name, quantity_g, kcal_100, protein_100,
       carb_100, fat_100, fiber_100, salt_100, image_url, raw, price_cents, scan_count, last_scanned_at, confirmed, fetched_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,0,NULL,0,?)`,
  ).run(
    barcode,
    guess.conceptId,
    p.brands ? String(p.brands).split(",")[0]!.trim() : null,
    name,
    packG,
    kcal100,
    protein100,
    carb100,
    fat100,
    fiber100,
    num(n.salt_100g),
    p.image_front_small_url ? String(p.image_front_small_url) : null,
    JSON.stringify({ categories_tags: p.categories_tags, quantity: p.quantity }),
    Math.floor(Date.now() / 1000),
  );

  return {
    barcode,
    name,
    brand: p.brands ? String(p.brands).split(",")[0]!.trim() : null,
    packG,
    kcal100,
    protein100,
    carb100,
    fat100,
    fiber100,
    salt100: num(n.salt_100g),
    nutritionFrom: source,
    suggestion,
    imageUrl: p.image_front_small_url ? String(p.image_front_small_url) : null,
    categories,
    cached: false,
    confirmed: false,
    conceptId: guess.conceptId,
    matchedBy: guess.how,
    priceCents: null,
  };
}
