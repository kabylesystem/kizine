import { currentUserId } from "@/server/auth";
import { getLang } from "./lang";
import { join } from "node:path";
import { rawDb } from "@/db/client";
import { loadConcepts, loadNutrition, loadRecipes } from "@/db/repo";
import { loadHighs } from "@/core/highs";
import { solveMeal } from "@/core/solver";
import { buildGroceryList, type GroceryList } from "@/core/grocery";
import { getPantry } from "./user";
import type { PlannedMeal, PlannerSlot } from "@/core/planner-types";
import type { SlotKind } from "@/core/types";

/**
 * Liste de courses exacte : on résout chaque repas au solveur avant d'agréger.
 * Les quantités achetées viennent donc des grammes réels, pas d'une estimation.
 */
export async function buildListFor(weekStart: string): Promise<{
  list: GroceryList;
  names: Record<string, string>;
  weekStart: string;
} | null> {
  const db = rawDb();
  const plan = await db
    .prepare("SELECT id FROM meal_plans WHERE user_id = ? AND week_start = ?")
    .get((await currentUserId()), weekStart) as { id: string } | undefined;
  if (!plan) return null;

  const rows = await db
    .prepare(
      `SELECT s.id AS slot_id, s.date, s.slot, s.label, s.kcal_target, s.protein_target, s.max_minutes, s.portable,
              ri.recipe_id, ri.grams, ri.kcal, ri.protein_g, ri.carb_g, ri.fat_g, ri.fiber_g, m.state
       FROM meal_slots s
       JOIN meals m ON m.slot_id = s.id
       JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       WHERE s.plan_id = ?`,
    )
    .all(plan.id) as unknown as Record<string, unknown>[];

  const index = await loadNutrition();
  const [recipes, concepts] = await Promise.all([loadRecipes(index), loadConcepts()]);
  const recipeById = new Map(recipes.map((r) => [r.id, r]));

  // Les grammes ont déjà été calculés à la génération du plan et écrits en base.
  // Relancer le solveur sur vingt et un repas à chaque affichage de la liste,
  // c'était une seconde perdue pour un résultat identique. On ne le charge que
  // si un repas n'a pas encore ses quantités.
  const needsSolving = rows.some((r) => {
    const state = String(r["state"]);
    if (state === "cooked" || state === "eating_out") return false;
    const raw = r["grams"];
    if (!raw) return true;
    try {
      return Object.keys(JSON.parse(String(raw)) as Record<string, number>).length === 0;
    } catch {
      return true;
    }
  });
  const solver = needsSolving
    ? await loadHighs(join(process.cwd(), "node_modules", "highs", "build"))
    : null;

  const slots: PlannerSlot[] = [];
  const meals: PlannedMeal[] = [];
  const gramsByMeal: Record<string, Record<string, number>> = {};

  for (const r of rows) {
    // Un repas déjà cuisiné ou pris dehors ne se rachète pas.
    const state = String(r["state"]);
    if (state === "cooked" || state === "eating_out" || state === "skipped") continue;
    const recipe = recipeById.get(String(r["recipe_id"]));
    if (!recipe) continue;
    const slot: PlannerSlot = {
      id: String(r["slot_id"]),
      date: String(r["date"]),
      dayIndex: 0,
      slot: String(r["slot"]) as SlotKind,
      label: String(r["label"]),
      kcalTarget: Number(r["kcal_target"]),
      proteinTarget: Number(r["protein_target"]),
      maxMinutes: Number(r["max_minutes"]),
      portable: Number(r["portable"] ?? 0) === 1,
      locked: false,
    };
    slots.push(slot);

    let grams: Record<string, number> = {};
    try {
      grams = r["grams"] ? (JSON.parse(String(r["grams"])) as Record<string, number>) : {};
    } catch {
      grams = {};
    }
    let estimate = {
      kcal: Number(r["kcal"] ?? 0),
      protein: Number(r["protein_g"] ?? 0),
      carb: Number(r["carb_g"] ?? 0),
      fat: Number(r["fat_g"] ?? 0),
      fiber: Number(r["fiber_g"] ?? 0),
    };
    if (Object.keys(grams).length === 0 && solver) {
      const solved = solveMeal(solver, recipe.ingredients, {
        kcal: slot.kcalTarget,
        kcalTolerance: 30,
        proteinMin: slot.proteinTarget,
      });
      grams = solved.grams;
      estimate = solved.totals;
    }
    gramsByMeal[slot.id] = grams;
    meals.push({ slotId: slot.id, recipeId: recipe.id, score: 0, breakdown: {}, estimate });
  }

  const lang = await getLang();
  const forceBuy = new Set(
    (
      await db
        .prepare("SELECT concept_id FROM pantry_declarations WHERE user_id = ? AND state = 'need'")
        .all((await currentUserId())) as unknown as { concept_id: string }[]
    ).map((r) => r.concept_id),
  );
  const list = buildGroceryList(
    meals,
    gramsByMeal,
    recipeById,
    new Map(slots.map((s) => [s.id, s])),
    concepts,
    await getPantry(),
    lang,
    forceBuy,
    weekStart,
  );

  const nameRows = await db.prepare("SELECT id, name_en, name_fr FROM food_concepts").all() as unknown as {
    id: string;
    name_en: string;
    name_fr: string;
  }[];
  return {
    list,
    names: Object.fromEntries(nameRows.map((r) => [r.id, lang === "fr" ? r.name_fr : r.name_en])),
    weekStart,
  };
}
