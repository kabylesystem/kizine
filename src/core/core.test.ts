import { describe, expect, it, beforeAll } from "vitest";
import { join } from "node:path";
import { macrosFor, sumMacros, atwaterKcal, energyDeviation, displayMacros } from "./nutrition";
import { toGrams, cookedWeight, rawWeightFor, weighable, UnitConversionError } from "./units";
import { solveMeal, suggestRelaxation } from "./solver";
import { loadHighs } from "./highs";
import type { LpSolver, SolverIngredient } from "./types";

const CHICKEN = { kcal: 109, protein: 20.9, carb: 0, fat: 2.89, fiber: 0 };
const RICE = { kcal: 351, protein: 7.08, carb: 78.4, fat: 0.63, fiber: 1.4 };
const OIL = { kcal: 899, protein: 0.3, carb: 0, fat: 99.9, fiber: 0 };
const ONION = { kcal: 35.9, protein: 1.19, carb: 6.39, fat: 0.5, fiber: 1.5 };
const GARLIC = { kcal: 109, protein: 5.31, carb: 18.6, fat: 0.5, fiber: 2 };

function ing(
  conceptId: string,
  nutrition: typeof CHICKEN,
  refG: number,
  minG: number,
  maxG: number,
  stiffness = 1,
  adjustable = true,
): SolverIngredient {
  return {
    conceptId,
    role: "protein_core",
    refG,
    minG,
    maxG,
    adjustable,
    stiffness,
    nutrition,
    optional: false,
  };
}

const RECIPE: SolverIngredient[] = [
  ing("chicken-breast", CHICKEN, 180, 120, 320, 1.4),
  ing("rice-basmati", RICE, 90, 50, 200, 0.6),
  ing("olive-oil", OIL, 14, 6, 28, 1.2),
  ing("onion", ONION, 90, 60, 140, 2.5),
  ing("garlic", GARLIC, 8, 4, 14, 8),
];

describe("nutrition", () => {
  it("met à l'échelle les macros par 100 g", () => {
    const m = macrosFor(CHICKEN, 236);
    expect(m.kcal).toBeCloseTo(257.24, 2);
    expect(m.protein).toBeCloseTo(49.324, 3);
  });

  it("additionne sans dériver", () => {
    const total = sumMacros([macrosFor(RICE, 137), macrosFor(OIL, 18)]);
    expect(total.kcal).toBeCloseTo(137 * 3.51 + 18 * 8.99, 6);
  });

  it("contrôle Atwater sur des données CIQUAL réelles", () => {
    expect(energyDeviation(macrosFor(CHICKEN, 100))).toBeLessThan(0.12);
    expect(energyDeviation(macrosFor(RICE, 100))).toBeLessThan(0.12);
  });

  it("l'énergie Atwater d'un gras pur reste cohérente", () => {
    expect(atwaterKcal(OIL)).toBeCloseTo(900.3, 1);
  });

  it("n'arrondit qu'à l'affichage", () => {
    const d = displayMacros(macrosFor(CHICKEN, 236));
    expect(d.kcal).toBe(257);
    expect(d.protein).toBe(49.3);
  });
});

describe("unités", () => {
  it("convertit les masses", () => {
    expect(toGrams(1.2, "kg")).toBe(1200);
    expect(toGrams(250, "g")).toBe(250);
  });

  it("convertit les volumes avec la densité", () => {
    expect(toGrams(200, "ml", { gPerMl: 1.03 })).toBeCloseTo(206);
    expect(toGrams(2, "tbsp", { gPerTbsp: 13 })).toBe(26);
  });

  it("refuse une conversion sans densité au lieu d'inventer", () => {
    expect(() => toGrams(1, "cup")).toThrow(UnitConversionError);
    expect(() => toGrams(2, "unit")).toThrow(UnitConversionError);
  });

  it("fait l'aller-retour cru vers cuit", () => {
    const factor = { conceptId: "rice-basmati", fromState: "dry" as const, toState: "cooked" as const, method: "boil", weightFactor: 2.7 };
    expect(cookedWeight(100, factor)).toBe(270);
    expect(rawWeightFor(270, factor)).toBeCloseTo(100, 6);
  });

  it("le poulet perd du poids, le riz en gagne", () => {
    const chicken = { conceptId: "chicken-breast", fromState: "raw" as const, toState: "cooked" as const, method: "pan", weightFactor: 0.73 };
    expect(cookedWeight(200, chicken)).toBeCloseTo(146);
  });

  it("arrondit au gramme au-dessus de 10 g", () => {
    expect(weighable(236.4)).toBe(236);
    expect(weighable(4.3)).toBe(4.5);
  });
});

describe("solveur de grammes", () => {
  let solver: LpSolver;
  beforeAll(async () => {
    solver = await loadHighs(join(process.cwd(), "node_modules", "highs", "build"));
  }, 20000);

  it("atteint la cible calorique et protéique", () => {
    const r = solveMeal(solver, RECIPE, { kcal: 1050, kcalTolerance: 15, proteinMin: 60 });
    expect(r.status).toBe("optimal");
    expect(Math.abs(r.totals.kcal - 1050)).toBeLessThan(15);
    expect(r.totals.protein).toBeGreaterThanOrEqual(59.5);
  });

  it("ne sort jamais des plages culinaires", () => {
    const r = solveMeal(solver, RECIPE, { kcal: 1400, kcalTolerance: 15, proteinMin: 80 });
    for (const i of RECIPE) {
      const g = r.grams[i.conceptId] ?? 0;
      expect(g).toBeGreaterThanOrEqual(i.minG - 0.6);
      expect(g).toBeLessThanOrEqual(i.maxG + 0.6);
    }
  });

  it("bouge le riz plus que l'ail", () => {
    const r = solveMeal(solver, RECIPE, { kcal: 1250, kcalTolerance: 15, proteinMin: 60 });
    const rice = r.moves.find((m) => m.conceptId === "rice-basmati");
    const garlic = r.moves.find((m) => m.conceptId === "garlic");
    expect(Math.abs(rice?.deltaPct ?? 0)).toBeGreaterThan(Math.abs(garlic?.deltaPct ?? 0));
  });

  it("respecte un ingrédient verrouillé à la main", () => {
    const r = solveMeal(solver, RECIPE, { kcal: 1050, kcalTolerance: 20, proteinMin: 55 }, { "rice-basmati": 110 });
    expect(r.grams["rice-basmati"]).toBe(110);
  });

  it("dit honnêtement quand la cible est hors d'atteinte", () => {
    const r = solveMeal(solver, RECIPE, { kcal: 3000, kcalTolerance: 15, proteinMin: 60 });
    expect(r.status).toBe("relaxed");
    expect(r.message).toContain("culinary ranges");
    const hint = suggestRelaxation(RECIPE, r);
    expect(hint).not.toBeNull();
    expect(hint?.direction).toBe("up");
  });

  it("est déterministe", () => {
    const a = solveMeal(solver, RECIPE, { kcal: 1100, kcalTolerance: 15, proteinMin: 62 });
    const b = solveMeal(solver, RECIPE, { kcal: 1100, kcalTolerance: 15, proteinMin: 62 });
    expect(a.grams).toEqual(b.grams);
  });

  it("résout en moins de 20 ms une fois chargé", () => {
    const t = performance.now();
    for (let i = 0; i < 10; i++) {
      solveMeal(solver, RECIPE, { kcal: 900 + i * 30, kcalTolerance: 15, proteinMin: 55 });
    }
    expect((performance.now() - t) / 10).toBeLessThan(20);
  });
});
