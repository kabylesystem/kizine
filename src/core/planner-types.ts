import type { Macros, SlotKind, SolverIngredient } from "./types";

export interface PlannerRecipe {
  id: string;
  title: string;
  cuisine: string;
  slotKinds: SlotKind[];
  flavorProfiles: string[];
  techniques: string[];
  activeMinutes: number;
  passiveMinutes: number;
  pansNeeded: number;
  equipmentRequired: string[];
  difficulty: number;
  spiceLevel: number;
  leftoverToleranceDays: number;
  ingredients: SolverIngredient[];
  /** Concepts qui portent l'identité du plat, pour la fatigue protéine. */
  proteinConcepts: string[];
  /** Grammes de viande, poisson ou oeufs atteignables, bornes hautes comprises. */
  animalProteinMaxG: number;
  portable: boolean;
  goodCold: boolean;
}

export interface PlannerSlot {
  id: string;
  date: string;
  dayIndex: number;
  slot: SlotKind;
  label: string;
  kcalTarget: number;
  proteinTarget: number;
  maxMinutes: number;
  /** Vrai quand le repas doit voyager : ni cuisson sur place, ni assiette. */
  portable: boolean;
  locked: boolean;
  lockedRecipeId?: string;
}

export interface ConceptMeta {
  id: string;
  packageG: number | null;
  boughtByWeight: boolean;
  openDays: number | null;
  keepDays: number;
  freezable: boolean;
  aisle: string;
  centsPerKg: number | null;
  /** D'où vient ce prix : un relevé de default-user, la référence française, ou rien. */
  priceSource: "mine" | "reference" | "none";
  /** Épices, huiles, condiments : achetés une fois, ils durent des mois. */
  staple: boolean;
  category: string;
  /** Poids d'une pièce en rayon, pour écrire « 5 carottes » et pas « 660 g ». */
  gPerUnit: number | null;
  unitLabel: string | null;
}

export interface PantryLot {
  conceptId: string;
  grams: number;
  daysToExpiry: number | null;
}

export interface PlannerContext {
  slots: PlannerSlot[];
  recipes: PlannerRecipe[];
  /** -1 (jamais) à 1 (adoré). Absent = neutre. */
  affinity: Record<string, number>;
  banned: Set<string>;
  dishElo: Record<string, number>;
  frequencyPerWeek: Record<string, number>;
  equipment: Set<string>;
  spiceTolerance: number;
  maxPans: number;
  pantry: PantryLot[];
  concepts: Record<string, ConceptMeta>;
  /** Créneaux où l'on préfère la routine à la nouveauté : on ne réinvente pas son petit-déjeuner. */
  routineSlots: Set<SlotKind>;
  /** Grammes de viande, poisson ou oeufs exigés sur un repas principal. 0 = pas d'exigence. */
  meatPerMainMealG: number;
  /** Créneaux considérés comme repas principaux. */
  mainSlots: Set<SlotKind>;
  weeklyBudgetCents: number | null;
  /** Budget par repas, dérivé du budget hebdo et du nombre de créneaux. */
  budgetPerMealCents: number | null;
  seed: number;
}

export interface ScoredCandidate {
  recipeId: string;
  score: number;
  breakdown: Record<string, number>;
  feasible: boolean;
  reason?: string;
}

export interface PlannedMeal {
  slotId: string;
  recipeId: string;
  score: number;
  breakdown: Record<string, number>;
  estimate: Macros;
}

export interface WeekPlan {
  meals: PlannedMeal[];
  score: number;
  penalties: { orphan: number; variety: number; budget: number };
  unfilled: string[];
}
