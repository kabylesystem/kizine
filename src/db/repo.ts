import { reference } from "./cache";
import { rawDb } from "./client";
import type { Macros, SlotKind } from "../core/types";
import type { ConceptMeta, PlannerRecipe } from "../core/planner-types";

interface FoodRow {
  concept_id: string;
  state: string;
  kcal_100: number;
  protein_100: number;
  carb_100: number;
  fat_100: number;
  fiber_100: number | null;
  source: string;
  source_ref: string | null;
  label: string;
}

export interface NutritionIndex {
  byConceptState: Map<string, Macros>;
  provenance: Map<string, { source: string; ref: string | null; label: string }>;
}

async function loadNutritionRaw(): Promise<NutritionIndex> {
  const rows = await rawDb()
    .prepare(
      "SELECT concept_id, state, kcal_100, protein_100, carb_100, fat_100, fiber_100, source, source_ref, label FROM foods",
    )
    .all() as unknown as FoodRow[];
  const byConceptState = new Map<string, Macros>();
  const provenance = new Map<string, { source: string; ref: string | null; label: string }>();
  for (const r of rows) {
    const key = `${r.concept_id}:${r.state}`;
    byConceptState.set(key, {
      kcal: r.kcal_100,
      protein: r.protein_100,
      carb: r.carb_100,
      fat: r.fat_100,
      fiber: r.fiber_100 ?? 0,
    });
    provenance.set(key, { source: r.source, ref: r.source_ref, label: r.label });
  }
  return { byConceptState, provenance };
}

/** Résout les macros d'un ingrédient : état demandé, sinon état par défaut du concept. */
export function nutritionFor(
  index: NutritionIndex,
  conceptId: string,
  state: string,
): Macros | null {
  return (
    index.byConceptState.get(`${conceptId}:${state}`) ??
    index.byConceptState.get(`${conceptId}:dry`) ??
    index.byConceptState.get(`${conceptId}:raw`) ??
    index.byConceptState.get(`${conceptId}:prepared`) ??
    null
  );
}

interface RecipeRow {
  id: string;
  title: string;
  cuisine: string;
  slot_kinds: string;
  flavor_profiles: string;
  techniques: string;
  active_minutes: number;
  passive_minutes: number;
  pans_needed: number;
  equipment_required: string;
  difficulty: number;
  spice_level: number;
  leftover_tolerance_days: number;
  portable: number;
  good_cold: number;
  reheatable: number;
}

interface IngRow {
  recipe_id: string;
  concept_id: string;
  expected_state: string;
  role: string;
  ref_g: number;
  min_g: number;
  max_g: number;
  adjustable: number;
  stiffness: number;
  optional: number;
}

/** Viande, poisson, fruits de mer, oeufs : ce que default-user appelle « de la protéine ». */
export const ANIMAL_PROTEIN = new Set([
  "chicken-breast", "chicken-thigh", "chicken-drumstick", "turkey-escalope",
  "beef-steak", "beef-mince-5", "beef-mince-15", "beef-braising",
  "lamb-shoulder", "lamb-chops", "merguez", "pork-loin", "lardons", "ham", "chorizo", "duck-breast",
  "salmon", "salmon-smoked", "tuna-canned", "cod", "white-fish", "sardines-canned",
  "mackerel-canned", "shrimp", "mussels", "squid", "egg",
]);

export interface LoadedRecipe extends PlannerRecipe {
  portable: boolean;
  goodCold: boolean;
  reheatable: boolean;
  passiveMinutes: number;
}

async function loadRecipesRaw(index: NutritionIndex): Promise<LoadedRecipe[]> {
  const db = rawDb();
  const recipes = await db
    .prepare("SELECT *, COALESCE(title_en, title) AS display_title FROM recipes WHERE enabled = 1")
    .all() as unknown as (RecipeRow & { display_title: string })[];
  const ings = await db
    .prepare("SELECT * FROM recipe_ingredients ORDER BY recipe_id, position")
    .all() as unknown as IngRow[];
  const byRecipe = new Map<string, IngRow[]>();
  for (const i of ings) {
    const list = byRecipe.get(i.recipe_id) ?? [];
    list.push(i);
    byRecipe.set(i.recipe_id, list);
  }

  const out: LoadedRecipe[] = [];
  for (const r of recipes) {
    const rows = byRecipe.get(r.id) ?? [];
    const ingredients = [];
    let usable = true;
    for (const row of rows) {
      const nutrition = nutritionFor(index, row.concept_id, row.expected_state);
      if (!nutrition) {
        usable = false;
        break;
      }
      ingredients.push({
        conceptId: row.concept_id,
        animal: ANIMAL_PROTEIN.has(row.concept_id),
        role: row.role as PlannerRecipe["ingredients"][number]["role"],
        refG: row.ref_g,
        minG: row.min_g,
        maxG: row.max_g,
        adjustable: row.adjustable === 1,
        stiffness: row.stiffness,
        nutrition,
        optional: row.optional === 1,
      });
    }
    if (!usable) continue;
    const proteinConcepts = ingredients
      .filter((i) => i.role === "protein_core")
      .map((i) => i.conceptId);
    const animalProteinMaxG = ingredients
      .filter((i) => ANIMAL_PROTEIN.has(i.conceptId) && !i.optional)
      .reduce((sum, i) => sum + (i.adjustable ? i.maxG : i.refG), 0);
    out.push({
      id: r.id,
      title: r.display_title,
      cuisine: r.cuisine,
      slotKinds: JSON.parse(r.slot_kinds) as SlotKind[],
      flavorProfiles: JSON.parse(r.flavor_profiles) as string[],
      techniques: JSON.parse(r.techniques) as string[],
      activeMinutes: r.active_minutes,
      passiveMinutes: r.passive_minutes,
      pansNeeded: r.pans_needed,
      equipmentRequired: JSON.parse(r.equipment_required) as string[],
      difficulty: r.difficulty,
      spiceLevel: r.spice_level,
      leftoverToleranceDays: r.leftover_tolerance_days,
      ingredients,
      proteinConcepts,
      animalProteinMaxG,
      portable: r.portable === 1,
      goodCold: r.good_cold === 1,
      reheatable: r.reheatable === 1,
    });
  }
  return out;
}

interface ConceptRow {
  id: string;
  typical_package_g: number | null;
  bought_by_weight: number;
  perishability_open_days: number | null;
  perishability_days: number;
  freezable: number;
  aisle: string;
  name_fr: string;
  category: string;
  swipeable: number;
  role: string;
  tags: string;
}

/** La partie stable d'un aliment : elle ne change qu'à l'import. */
async function loadConceptRowsRaw(): Promise<{
  rows: ConceptRow[];
  units: Map<string, { concept_id: string; g_per_unit: number; unit_label: string | null }>;
}> {
  const [rows, unitRows] = await Promise.all([
    rawDb().prepare("SELECT * FROM food_concepts").all() as unknown as Promise<ConceptRow[]>,
    rawDb()
      .prepare("SELECT concept_id, g_per_unit, unit_label FROM food_densities WHERE g_per_unit IS NOT NULL")
      .all() as unknown as Promise<{ concept_id: string; g_per_unit: number; unit_label: string | null }[]>,
  ]);
  return { rows, units: new Map(unitRows.map((u) => [u.concept_id, u])) };
}

async function loadConceptsRaw(): Promise<Record<string, ConceptMeta>> {
  // Les prix, eux, bougent dès qu'il en relève un en magasin : jamais en cache.
  const [{ rows, units }, prices] = await Promise.all([
    reference("concept-rows", loadConceptRowsRaw),
    rawDb()
      .prepare(
        `SELECT concept_id,
                AVG(CASE WHEN source <> 'reference' THEN cents_per_kg END) AS mine,
                AVG(CASE WHEN source = 'reference' THEN cents_per_kg END) AS ref
         FROM price_observations GROUP BY concept_id`,
      )
      .all() as unknown as Promise<{ concept_id: string; mine: number | null; ref: number | null }[]>,
  ]);
  const priceByConcept = new Map(prices.map((p) => [p.concept_id, p.mine ?? p.ref]));
  const priceSource = new Map(prices.map((p) => [p.concept_id, p.mine !== null ? "mine" : "reference"]));

  const out: Record<string, ConceptMeta> = {};
  for (const r of rows) {
    out[r.id] = {
      id: r.id,
      packageG: r.typical_package_g,
      boughtByWeight: r.bought_by_weight === 1,
      openDays: r.perishability_open_days,
      keepDays: r.perishability_days,
      freezable: r.freezable === 1,
      aisle: r.aisle,
      centsPerKg: priceByConcept.get(r.id) ?? null,
      priceSource: (priceSource.get(r.id) ?? "none") as "mine" | "reference" | "none",
      // Stock longue durée : ce qu'on achète une fois et qui tient des semaines.
      // Le paquet ne doit pas peser sur le budget d'UNE semaine : seul ce qui est
      // réellement consommé compte. Une conserve ouverte, elle, se consomme d'un coup :
      // elle reste facturée au paquet.
      staple: r.perishability_days >= 90 && (r.perishability_open_days === null || r.perishability_open_days >= 30),
      category: r.category,
      gPerUnit: units.get(r.id)?.g_per_unit ?? null,
      unitLabel: units.get(r.id)?.unit_label ?? null,
    };
  }
  return out;
}

export interface ConceptCard {
  id: string;
  nameFr: string;
  nameEn: string;
  category: string;
  role: string;
  tags: string[];
  aisle: string;
}

async function loadSwipeDeckRaw(): Promise<ConceptCard[]> {
  const rows = await rawDb()
    .prepare("SELECT * FROM food_concepts WHERE swipeable = 1 ORDER BY category, id")
    .all() as unknown as (ConceptRow & { name_en: string })[];
  return rows.map((r) => ({
    id: r.id,
    nameFr: r.name_fr,
    nameEn: r.name_en,
    category: r.category,
    role: r.role,
    tags: JSON.parse(r.tags) as string[],
    aisle: r.aisle,
  }));
}

/**
 * Versions mises en cache. Le contenu ne change qu'au moment d'un import,
 * pas au fil de son utilisation : le relire à chaque clic ne servait qu'à
 * payer une quinzaine d'allers-retours réseau.
 */
export const loadNutrition = (): Promise<NutritionIndex> => reference("nutrition", loadNutritionRaw);

export const loadRecipes = (index: NutritionIndex): Promise<LoadedRecipe[]> =>
  reference("recipes", () => loadRecipesRaw(index));

export const loadConcepts = (): Promise<Record<string, ConceptMeta>> => loadConceptsRaw();

export const loadSwipeDeck = (): Promise<ConceptCard[]> => reference("swipe-deck", loadSwipeDeckRaw);
