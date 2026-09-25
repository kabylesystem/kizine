import { join } from "node:path";
import { rawDb } from "@/db/client";
import { loadNutrition, loadRecipes, type LoadedRecipe } from "@/db/repo";
import { loadHighs } from "@/core/highs";
import { cookPlanFor, type CookPlan } from "@/core/cook";
import type { PlannerSlot } from "@/core/planner-types";
import type { YieldFactor } from "@/core/units";
import type { FoodState, SlotKind } from "@/core/types";

let yieldCache: YieldFactor[] | null = null;

export async function loadYields(): Promise<YieldFactor[]> {
  if (yieldCache) return yieldCache;
  const rows = await rawDb()
    .prepare("SELECT concept_id, from_state, to_state, method, weight_factor FROM yield_factors")
    .all() as unknown as {
    concept_id: string;
    from_state: string;
    to_state: string;
    method: string;
    weight_factor: number;
  }[];
  yieldCache = rows.map((r) => ({
    conceptId: r.concept_id,
    fromState: r.from_state as FoodState,
    toState: r.to_state as FoodState,
    method: r.method,
    weightFactor: r.weight_factor,
  }));
  return yieldCache;
}

export interface CookScreen {
  slot: PlannerSlot;
  recipe: LoadedRecipe;
  steps: { position: number; text: string }[];
  plan: CookPlan;
  labels: Record<string, { nameEn: string; nameFr: string; state: string; source: string; sourceRef: string | null; label: string }>;
  mealId: string | null;
  state: string | null;
  cuisine: string;
  equipment: string[];
  passiveMinutes: number;
  notes: string | null;
  /** Photo du plat : on cuisine mieux quand on sait à quoi ça doit ressembler. */
  image: string | null;
}

export async function buildCookScreen(slotId: string, locked: Record<string, number> = {}): Promise<CookScreen | null> {
  const db = rawDb();
  const slotRow = await db
    .prepare(
      `SELECT s.id, s.date, s.slot, s.label, s.kcal_target, s.protein_target, s.max_minutes, s.portable, s.locked,
              m.id AS meal_id, m.state, ri.recipe_id
       FROM meal_slots s
       LEFT JOIN meals m ON m.slot_id = s.id
       LEFT JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       WHERE s.id = ?`,
    )
    .get(slotId) as Record<string, unknown> | undefined;
  if (!slotRow || !slotRow["recipe_id"]) return null;

  const index = await loadNutrition();
  const recipes = await loadRecipes(index);
  const recipe = recipes.find((r) => r.id === String(slotRow["recipe_id"]));
  if (!recipe) return null;

  const slot: PlannerSlot = {
    id: String(slotRow["id"]),
    date: String(slotRow["date"]),
    dayIndex: 0,
    slot: String(slotRow["slot"]) as SlotKind,
    label: String(slotRow["label"]),
    kcalTarget: Number(slotRow["kcal_target"]),
    proteinTarget: Number(slotRow["protein_target"]),
    maxMinutes: Number(slotRow["max_minutes"]),
    portable: Number(slotRow["portable"] ?? 0) === 1,
    locked: Number(slotRow["locked"]) === 1,
  };

  const solver = await loadHighs(join(process.cwd(), "node_modules", "highs", "build"));
  const plan = cookPlanFor(solver, recipe, slot, await loadYields(), locked);

  const conceptIds = recipe.ingredients.map((i) => i.conceptId);
  const placeholders = conceptIds.map(() => "?").join(",");
  const [steps, conceptRows, ingStates] = await Promise.all([
    db
      .prepare("SELECT position, text FROM recipe_steps WHERE recipe_id = ? ORDER BY position")
      .all(recipe.id) as unknown as Promise<{ position: number; text: string }[]>,
    db
      .prepare(`SELECT id, name_en, name_fr FROM food_concepts WHERE id IN (${placeholders})`)
      .all(...conceptIds) as unknown as Promise<{ id: string; name_en: string; name_fr: string }[]>,
    db
      .prepare("SELECT concept_id, expected_state FROM recipe_ingredients WHERE recipe_id = ?")
      .all(recipe.id) as unknown as Promise<{ concept_id: string; expected_state: string }[]>,
  ]);
  const stateBy = new Map(ingStates.map((r) => [r.concept_id, r.expected_state]));

  const labels: CookScreen["labels"] = {};
  for (const c of conceptRows) {
    const state = stateBy.get(c.id) ?? "raw";
    const prov =
      index.provenance.get(`${c.id}:${state}`) ??
      index.provenance.get(`${c.id}:dry`) ??
      index.provenance.get(`${c.id}:raw`);
    labels[c.id] = {
      nameEn: c.name_en,
      nameFr: c.name_fr,
      state,
      source: prov?.source ?? "?",
      sourceRef: prov?.ref ?? null,
      label: prov?.label ?? c.name_fr,
    };
  }

  const meta = await db
    .prepare(
      `SELECT r.equipment_required, r.passive_minutes, r.notes, r.cuisine, a.path AS image
       FROM recipes r LEFT JOIN image_assets a ON a.id = r.image_id WHERE r.id = ?`,
    )
    .get(recipe.id) as {
    equipment_required: string;
    passive_minutes: number;
    notes: string | null;
    cuisine: string;
    image: string | null;
  };

  return {
    slot,
    recipe,
    steps,
    plan,
    labels,
    mealId: slotRow["meal_id"] ? String(slotRow["meal_id"]) : null,
    state: slotRow["state"] ? String(slotRow["state"]) : null,
    cuisine: meta.cuisine,
    equipment: JSON.parse(meta.equipment_required) as string[],
    passiveMinutes: meta.passive_minutes,
    notes: meta.notes,
    image: meta.image,
  };
}
