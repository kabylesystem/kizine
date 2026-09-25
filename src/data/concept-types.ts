export type ConceptCategory =
  | "protein"
  | "carb"
  | "vegetable"
  | "fruit"
  | "dairy"
  | "fat"
  | "sauce"
  | "spice"
  | "staple"
  | "drink";

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

export type FoodState = "raw" | "cooked" | "dry" | "prepared";

export interface ConceptSeed {
  id: string;
  fr: string;
  en: string;
  category: ConceptCategory;
  role: IngredientRole;
  /** CIQUAL code (number) or a search query: terms joined with "+" all have to match. */
  raw: number | string;
  /** Cooked counterpart, when the concept is normally eaten cooked. */
  cooked?: number | string;
  cookedMethod?: string;
  /** Raw state label override: dry goods are stored as "dry". */
  rawState?: FoodState;
  tags?: string[];
  aliases?: string[];
  /** Days of shelf life once bought, unopened. */
  keepDays?: number;
  /** Days once opened. */
  openDays?: number;
  freezable?: boolean;
  /** Typical French supermarket package, in grams. */
  packageG?: number;
  boughtByWeight?: boolean;
  aisle?: string;
  /** Shown in the onboarding swipe deck. */
  swipe?: boolean;
  gPerMl?: number;
  gPerTbsp?: number;
  gPerTsp?: number;
  gPerUnit?: number;
  unitLabel?: string;
  /** Kcal per gram floor used to flag calorie-dense loading foods. */
  dense?: boolean;
}
