import type { FoodState } from "./types";

export interface Density {
  gPerMl?: number | null;
  gPerTbsp?: number | null;
  gPerTsp?: number | null;
  gPerUnit?: number | null;
}

export type VolumeUnit = "ml" | "cl" | "l" | "tbsp" | "tsp" | "cup" | "unit" | "g" | "kg";

const ML_PER: Record<string, number> = { ml: 1, cl: 10, l: 1000, cup: 240, tbsp: 15, tsp: 5 };

export class UnitConversionError extends Error {}

/**
 * Convertit n'importe quelle unité vers des grammes.
 * Le domaine ne manipule que des grammes : cette fonction est la seule frontière.
 */
export function toGrams(amount: number, unit: VolumeUnit, density: Density = {}): number {
  if (!Number.isFinite(amount)) throw new UnitConversionError("quantité invalide");
  switch (unit) {
    case "g":
      return amount;
    case "kg":
      return amount * 1000;
    case "tbsp":
      if (density.gPerTbsp) return amount * density.gPerTbsp;
      break;
    case "tsp":
      if (density.gPerTsp) return amount * density.gPerTsp;
      break;
    case "unit":
      if (density.gPerUnit) return amount * density.gPerUnit;
      throw new UnitConversionError("poids unitaire inconnu pour cet aliment");
    default:
      break;
  }
  const ml = ML_PER[unit];
  if (ml === undefined) throw new UnitConversionError(`unité inconnue : ${unit}`);
  const gPerMl = density.gPerMl;
  if (!gPerMl) throw new UnitConversionError("densité inconnue pour cet aliment");
  return amount * ml * gPerMl;
}

export interface YieldFactor {
  conceptId: string;
  fromState: FoodState;
  toState: FoodState;
  method: string;
  weightFactor: number;
}

/** Poids après cuisson, à partir du poids pesé (cru ou sec). */
export function cookedWeight(rawGrams: number, factor: YieldFactor): number {
  return rawGrams * factor.weightFactor;
}

/** Poids à peser pour obtenir un poids cuit donné. Sert quand une recette parle en cuit. */
export function rawWeightFor(cookedGrams: number, factor: YieldFactor): number {
  if (factor.weightFactor <= 0) throw new UnitConversionError("facteur de rendement invalide");
  return cookedGrams / factor.weightFactor;
}

export function pickYield(
  factors: YieldFactor[],
  conceptId: string,
  method?: string | null,
): YieldFactor | null {
  const forConcept = factors.filter((f) => f.conceptId === conceptId);
  if (forConcept.length === 0) return null;
  if (method) {
    const exact = forConcept.find((f) => f.method === method);
    if (exact) return exact;
  }
  return forConcept[0] ?? null;
}

/** Arrondi de pesée : la balance de cuisine affiche le gramme. */
export function weighable(grams: number): number {
  if (grams < 10) return Math.round(grams * 2) / 2;
  return Math.round(grams);
}
