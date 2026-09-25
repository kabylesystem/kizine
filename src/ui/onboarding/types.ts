export type Verdict = "love" | "like" | "meh" | "never";

export interface DeckCard {
  id: string;
  nameFr: string;
  nameEn: string;
  category: string;
  role: string;
  tags: string[];
  image: string | null;
}

export interface DuelDish {
  id: string;
  title: string;
  cuisine: string;
  flavors: string[];
  activeMinutes: number;
  image: string | null;
  concepts: string[];
}

export interface OnboardingData {
  deck: DeckCard[];
  dishes: DuelDish[];
}

export type DayContext = "home" | "school" | "away" | "flexible";

export interface DayPlanDraft {
  weekday: number;
  label: string;
  context: DayContext;
  meals: 2 | 3 | 4;
  cookMinutes: number;
}

export interface OnboardingResult {
  verdicts: Record<string, Verdict>;
  elo: Record<string, number>;
  duels: { left: string; right: string; winner: string }[];
  frequency: Record<string, number>;
  days: DayPlanDraft[];
  body: {
    weightKg: number;
    heightCm: number;
    ageYears: number;
    sex: "m" | "f" | null;
    activityFactor: number;
    goalKind: "bulk" | "bulkFast" | "maintain" | "cut";
    kgPerWeek: number;
    proteinPerKg: number;
    kcalTarget: number;
    proteinTarget: number;
  };
  /** Sport, trajets et vie quotidienne : de quoi calculer la dépense réelle. */
  energy: {
    dailyLife: "seated" | "mixed" | "onFeet" | "physical";
    sessions: { sportId: string; perWeek: number; blockMinutes?: Record<string, number> }[];
    commutes: {
      label: string;
      from?: string;
      to?: string;
      km: number;
      mode: "walk" | "bike" | "ebike" | "transit" | "scooter" | "car";
      tripsPerWeek: number;
    }[];
    maintenanceKcal: number;
  };
  kitchen: {
    equipment: string[];
    spiceTolerance: number;
    maxPans: number;
    shoppingWeekday: number;
    weeklyBudgetEur: number | null;
    leftoverTolerance: number;
  };
}

export const VERDICT_META: Record<Verdict, { label: string; color: string; solid: string; key: string }> = {
  love: { label: "Love it", color: "var(--tomate)", solid: "#d63127", key: "ArrowUp" },
  like: { label: "Fine", color: "var(--feuille)", solid: "#137a42", key: "ArrowRight" },
  meh: { label: "Meh", color: "var(--curcuma)", solid: "#c07a06", key: "ArrowLeft" },
  never: { label: "Never", color: "var(--aubergine)", solid: "#4d2880", key: "ArrowDown" },
};

/**
 * Couleurs FIXES pour les cartes photo : une carte porte toujours du texte blanc
 * sur un voile sombre, quel que soit le thème du lecteur. Les jetons du thème
 * s'éclaircissent en mode sombre et rendraient le titre illisible.
 */
export const CATEGORY_SOLID: Record<string, string> = {
  protein: "#d63127",
  carb: "#c07a06",
  vegetable: "#137a42",
  fruit: "#ab1565",
  dairy: "#2440c8",
  fat: "#4d2880",
  sauce: "#d63127",
  spice: "#c07a06",
  staple: "#2440c8",
};

export const CATEGORY_COLOR: Record<string, string> = {
  protein: "var(--tomate)",
  carb: "var(--curcuma)",
  vegetable: "var(--feuille)",
  fruit: "var(--betterave)",
  dairy: "var(--myrtille)",
  fat: "var(--aubergine)",
  sauce: "var(--tomate)",
  spice: "var(--curcuma)",
  staple: "var(--myrtille)",
};

export const CATEGORY_LABEL: Record<string, string> = {
  protein: "Protein",
  carb: "Carbs",
  vegetable: "Vegetables",
  fruit: "Fruit",
  dairy: "Dairy",
  fat: "Fats and nuts",
  sauce: "Sauces",
  spice: "Spices and herbs",
  staple: "Pantry",
};
