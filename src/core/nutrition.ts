import type { Macros, FoodNutrition } from "./types";
import { ZERO_MACROS } from "./types";

const round = (n: number, digits = 1): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** Macros d'une quantité en grammes, à partir de valeurs pour 100 g. */
export function macrosFor(per100: Macros, grams: number): Macros {
  const k = grams / 100;
  return {
    kcal: per100.kcal * k,
    protein: per100.protein * k,
    carb: per100.carb * k,
    fat: per100.fat * k,
    fiber: per100.fiber * k,
  };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carb: a.carb + b.carb,
    fat: a.fat + b.fat,
    fiber: a.fiber + b.fiber,
  };
}

export function sumMacros(items: Macros[]): Macros {
  return items.reduce(addMacros, ZERO_MACROS);
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return {
    kcal: m.kcal * factor,
    protein: m.protein * factor,
    carb: m.carb * factor,
    fat: m.fat * factor,
    fiber: m.fiber * factor,
  };
}

/** Arrondi d'affichage. Le calcul interne reste en flottant. */
export function displayMacros(m: Macros): Macros {
  return {
    kcal: Math.round(m.kcal),
    protein: round(m.protein),
    carb: round(m.carb),
    fat: round(m.fat),
    fiber: round(m.fiber),
  };
}

/**
 * Contrôle Atwater : l'énergie déclarée doit rester cohérente avec les macros.
 * Sert de garde-fou sur les données importées, jamais à remplacer une valeur mesurée.
 */
export function atwaterKcal(m: Pick<Macros, "protein" | "carb" | "fat" | "fiber">): number {
  return m.protein * 4 + m.carb * 4 + m.fat * 9 + m.fiber * 2;
}

export function energyDeviation(m: Macros): number {
  const expected = atwaterKcal(m);
  if (expected === 0) return m.kcal === 0 ? 0 : 1;
  return Math.abs(m.kcal - expected) / expected;
}

export function totalOf(entries: { per100: Macros; grams: number }[]): Macros {
  return sumMacros(entries.map((e) => macrosFor(e.per100, e.grams)));
}

export function macrosFromFood(food: FoodNutrition, grams: number): Macros {
  return macrosFor(food, grams);
}

/** Coût énergétique par gramme, utilisé pour repérer les aliments de charge. */
export function energyDensity(per100: Macros): number {
  return per100.kcal / 100;
}
