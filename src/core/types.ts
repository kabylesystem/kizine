export type FoodState = "raw" | "cooked" | "dry" | "prepared";

export type IngredientRole =
  | "protein_core"
  | "carb_base"
  | "fat_carrier"
  | "vegetable_bulk"
  | "aromatic"
  | "acid"
  | "finisher"
  | "binder"
  | "liquid"
  | "sweetener";

export type SlotKind = "breakfast" | "lunch" | "dinner" | "snack";

export interface Macros {
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  fiber: number;
}

export const ZERO_MACROS: Macros = { kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 };

/** Valeurs pour 100 g, telles que stockées en base avec leur provenance. */
export interface FoodNutrition extends Macros {
  foodId: string;
  conceptId: string;
  state: FoodState;
  label: string;
  source: string;
  sourceRef: string | null;
}

export interface SolverIngredient {
  conceptId: string;
  /** Viande, poisson ou oeufs : compte dans la contrainte de portion. */
  animal?: boolean;
  role: IngredientRole;
  /** Quantité de référence de la recette, en grammes, pour baseServings. */
  refG: number;
  minG: number;
  maxG: number;
  adjustable: boolean;
  /** Plus c'est haut, moins l'ingrédient bouge. L'ail est raide, le riz est souple. */
  stiffness: number;
  nutrition: Macros;
  optional: boolean;
}

export interface SolverTarget {
  kcal: number;
  kcalTolerance: number;
  proteinMin: number;
  proteinMax?: number;
  fatMin?: number;
  /** Grammes minimum de protéine animale dans l'assiette. */
  animalMinG?: number;
}

export type SolverStatus = "optimal" | "relaxed" | "infeasible";

export interface SolverResult {
  status: SolverStatus;
  grams: Record<string, number>;
  totals: Macros;
  /** Écart restant après résolution, non nul seulement si status = relaxed. */
  gap: { kcal: number; protein: number };
  /** Ce qui a bougé et de combien, pour l'écran d'explication. */
  moves: { conceptId: string; refG: number; finalG: number; deltaPct: number }[];
  message: string | null;
}

export interface LpSolver {
  solve(model: string): {
    status: string;
    columns: Record<string, number>;
  };
}
