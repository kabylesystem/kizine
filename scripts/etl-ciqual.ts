import { loadCiqual, nutrientsOf, normalize } from "./lib/ciqual";
import { resolveFood } from "./lib/resolve";
import { allConcepts } from "../src/data/concepts";
import { ciqualPins, manualFoods } from "../src/data/ciqual-pins";
import { yieldSeeds } from "../src/data/yield-factors";
import { deckIds } from "../src/data/deck";
import { referencePricesEurPerKg } from "../src/data/prices";
import { migrate, rawDb } from "../src/db/client";

await migrate();
const conn = rawDb();
const dbx = loadCiqual("data/raw");

const atwater = (p: number, c: number, f: number, fiber: number): number =>
  Math.round((p * 4 + c * 4 + f * 9 + fiber * 2) * 10) / 10;

conn.exec("BEGIN");
try {
  const srcStmt = conn.prepare(
    "INSERT OR REPLACE INTO nutrition_sources (code, name, license, url, version, imported_at) VALUES (?,?,?,?,?,?)",
  );
  const ts = Math.floor(Date.now() / 1000);
  await srcStmt.run("ciqual", "ANSES CIQUAL", "Licence Ouverte / Open Licence", "https://ciqual.anses.fr/", "2025-11-03", ts);
  await srcStmt.run("usda", "USDA ARS cooking yields and retention factors", "Domaine public", "https://www.ars.usda.gov/", "Release 2 / Release 6", ts);
  await srcStmt.run("manual", "Étiquettes françaises et USDA FoodData Central", "Relevé manuel", "https://fdc.nal.usda.gov/", "2026-08-30", ts);
  await srcStmt.run("computed", "Calcul Atwater à partir des macros", "Interne", "", "1", ts);

  const conceptStmt = conn.prepare(`
    INSERT OR REPLACE INTO food_concepts
      (id, name_fr, name_en, category, subcategory, role, tags, default_state, perishability_days,
       perishability_open_days, freezable, typical_package_g, bought_by_weight, aisle, swipeable, image_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const foodStmt = conn.prepare(`
    INSERT OR REPLACE INTO foods
      (id, concept_id, state, cooking_method, label, kcal_100, protein_100, carb_100, sugar_100,
       fat_100, sat_fat_100, fiber_100, salt_100, micros, source, source_ref, confidence, basis, fetched_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const aliasStmt = conn.prepare(
    "INSERT OR IGNORE INTO ingredient_aliases (concept_id, raw_text, normalized, lang, origin, confidence) VALUES (?,?,?,?,?,?)",
  );
  const densityStmt = conn.prepare(
    "INSERT OR REPLACE INTO food_densities (concept_id, g_per_ml, g_per_tbsp, g_per_tsp, g_per_unit, unit_label, source) VALUES (?,?,?,?,?,?,?)",
  );
  const yieldStmt = conn.prepare(
    "INSERT OR REPLACE INTO yield_factors (concept_id, from_state, to_state, method, weight_factor, source, note) VALUES (?,?,?,?,?,?,?)",
  );

  const deck = new Set(deckIds);
  const priceStmt = conn.prepare(
    "INSERT INTO price_observations (concept_id, barcode, store_id, price_cents, quantity_g, cents_per_kg, at, source) VALUES (?,?,?,?,?,?,?,?)",
  );
  await conn.prepare("DELETE FROM price_observations WHERE source = 'reference'").run();

  const report: string[] = [];
  let foodCount = 0;

  const insertFromCiqual = async (
    conceptId: string,
    code: string,
    state: string,
    method: string | null,
  ): Promise<boolean> => {
    const food = dbx.foods.get(code);
    if (!food) return false;
    const n = nutrientsOf(dbx, code);
    const protein = n.protein ?? 0;
    const carb = n.carb ?? 0;
    const fat = n.fat ?? 0;
    const fiber = n.fiber ?? 0;
    let kcal = n.kcal;
    let source = "ciqual";
    if (kcal === null) {
      kcal = atwater(protein, carb, fat, fiber);
      source = "computed";
    }
    const micros = Object.fromEntries(
      Object.entries(n.micros).filter(([, v]) => v !== null),
    ) as Record<string, number>;
    await foodStmt.run(
      `${conceptId}:${state}${method ? `:${method}` : ""}`,
      conceptId,
      state,
      method,
      food.nameFr,
      kcal,
      protein,
      carb,
      n.sugar,
      fat,
      n.satFat,
      n.fiber,
      n.salt,
      JSON.stringify(micros),
      source,
      `ciqual:${code}`,
      n.confidence,
      "per_100g",
      ts,
    );
    foodCount++;
    return true;
  };

  for (const c of allConcepts) {
    await conceptStmt.run(
      c.id,
      c.fr,
      c.en,
      c.category,
      c.tags?.[0] ?? null,
      c.role,
      JSON.stringify(c.tags ?? []),
      c.rawState ?? "raw",
      c.keepDays ?? 30,
      c.openDays ?? null,
      c.freezable ? 1 : 0,
      c.packageG ?? null,
      c.boughtByWeight ? 1 : 0,
      c.aisle ?? "epicerie",
      deck.has(c.id) ? 1 : 0,
      null,
    );

    const eurPerKg = referencePricesEurPerKg[c.id];
    if (eurPerKg === undefined) {
      report.push(`SANS PRIX  ${c.id}`);
    } else {
      await priceStmt.run(c.id, null, null, Math.round(eurPerKg * 100), 1000, Math.round(eurPerKg * 100), ts, "reference");
    }

    const pin = ciqualPins[c.id];
    const rawState = c.rawState ?? "raw";
    const manual = manualFoods[c.id];

    let baseOk = false;
    if (manual) {
      await foodStmt.run(
        `${c.id}:${rawState}`,
        c.id,
        rawState,
        null,
        c.fr,
        manual.kcal,
        manual.protein,
        manual.carb,
        null,
        manual.fat,
        null,
        manual.fiber ?? null,
        manual.salt ?? null,
        null,
        "manual",
        manual.note,
        "M",
        "per_100g",
        ts,
      );
      foodCount++;
      baseOk = true;
    } else {
      const rawCode = pin?.raw !== undefined ? String(pin.raw) : resolveFood(dbx, c.raw).code;
      if (rawCode) baseOk = await insertFromCiqual(c.id, rawCode, rawState, null);
    }
    if (!baseOk) report.push(`SANS BASE  ${c.id}`);

    const cookedCode =
      pin?.cooked !== undefined
        ? String(pin.cooked)
        : c.cooked !== undefined
          ? resolveFood(dbx, c.cooked).code
          : null;
    if (cookedCode) await insertFromCiqual(c.id, cookedCode, "cooked", c.cookedMethod ?? null);

    const aliases = new Set<string>([c.fr, c.en, ...(c.aliases ?? [])]);
    for (const a of aliases) {
      await aliasStmt.run(c.id, a, normalize(a), /[a-z]/.test(a) ? "fr" : "fr", "seed", 1);
    }

    if (c.gPerMl || c.gPerTbsp || c.gPerTsp || c.gPerUnit) {
      await densityStmt.run(
        c.id,
        c.gPerMl ?? 1,
        c.gPerTbsp ?? null,
        c.gPerTsp ?? null,
        c.gPerUnit ?? null,
        c.unitLabel ?? null,
        "manual",
      );
    }
  }

  const knownConcepts = new Set(allConcepts.map((c) => c.id));
  for (const y of yieldSeeds) {
    if (!knownConcepts.has(y.concept)) {
      report.push(`YIELD ORPHELIN  ${y.concept}`);
      continue;
    }
    await yieldStmt.run(y.concept, y.from, y.to, y.method, y.factor, y.source, null);
  }

  conn.exec("COMMIT");
  console.log(`concepts: ${allConcepts.length} | deck: ${deck.size}`);
  console.log(`foods:    ${foodCount}`);
  console.log(`yields:   ${yieldSeeds.length}`);
  if (report.length) {
    console.log("\nà corriger :");
    for (const line of report) console.log("  " + line);
  } else {
    console.log("\naucun trou");
  }
} catch (err) {
  conn.exec("ROLLBACK");
  throw err;
}
