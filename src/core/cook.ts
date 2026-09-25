import type { LpSolver, Macros, SolverResult } from "./types";
import { solveMeal, suggestRelaxation } from "./solver";
import type { PlannerRecipe, PlannerSlot } from "./planner-types";
import { macrosFor, sumMacros, displayMacros } from "./nutrition";
import { pickYield, cookedWeight, type YieldFactor } from "./units";

export interface CookPlan {
  recipeId: string;
  slotId: string;
  grams: Record<string, number>;
  cookedGrams: Record<string, number>;
  totals: Macros;
  display: Macros;
  status: SolverResult["status"];
  message: string | null;
  hint: { conceptId: string; direction: "up" | "down"; reason: string } | null;
  moves: SolverResult["moves"];
}

/**
 * Le calcul exact, au moment de cuisiner.
 * Le planificateur estime, ce solveur tranche : c'est lui qui produit les grammes affichés.
 */
export function cookPlanFor(
  solver: LpSolver,
  recipe: PlannerRecipe,
  slot: PlannerSlot,
  yields: YieldFactor[],
  locked: Record<string, number> = {},
  tolerance = 25,
): CookPlan {
  const result = solveMeal(
    solver,
    recipe.ingredients,
    {
      kcal: slot.kcalTarget,
      kcalTolerance: tolerance,
      proteinMin: slot.proteinTarget,
    },
    locked,
  );

  const cookedGrams: Record<string, number> = {};
  for (const [conceptId, g] of Object.entries(result.grams)) {
    const factor = pickYield(yields, conceptId);
    cookedGrams[conceptId] = factor ? Math.round(cookedWeight(g, factor)) : g;
  }

  const totals = sumMacros(
    recipe.ingredients.map((i) => macrosFor(i.nutrition, result.grams[i.conceptId] ?? 0)),
  );

  return {
    recipeId: recipe.id,
    slotId: slot.id,
    grams: result.grams,
    cookedGrams,
    totals,
    display: displayMacros(totals),
    status: result.status,
    message: result.message,
    hint: suggestRelaxation(recipe.ingredients, result),
    moves: result.moves,
  };
}
