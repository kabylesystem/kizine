import type { LpSolver, Macros, SolverIngredient, SolverResult, SolverTarget } from "./types";
import { macrosFor, sumMacros } from "./nutrition";
import { weighable } from "./units";

const PENALTY_KCAL = 500;
const PENALTY_PROTEIN = 900;
const num = (n: number): string => (Number.isFinite(n) ? n.toFixed(6) : "0");

interface Slot {
  key: string;
  ing: SolverIngredient;
  lo: number;
  hi: number;
  fixed: boolean;
}

function buildSlots(
  ingredients: SolverIngredient[],
  locked: Record<string, number>,
): Slot[] {
  return ingredients.map((ing, i) => {
    const lockedG = locked[ing.conceptId];
    if (lockedG !== undefined) {
      return { key: `x${i}`, ing, lo: lockedG, hi: lockedG, fixed: true };
    }
    if (!ing.adjustable) {
      return { key: `x${i}`, ing, lo: ing.refG, hi: ing.refG, fixed: true };
    }
    return { key: `x${i}`, ing, lo: ing.minG, hi: ing.maxG, fixed: false };
  });
}

function buildModel(slots: Slot[], target: SolverTarget): string {
  const obj: string[] = [];
  const cons: string[] = [];
  const bounds: string[] = [];

  for (const s of slots) {
    bounds.push(` ${num(s.lo)} <= ${s.key} <= ${num(s.hi)}`);
    if (s.fixed) continue;
    const d = `d_${s.key}`;
    const ref = Math.max(s.ing.refG, 1);
    obj.push(`${num(s.ing.stiffness)} ${d}`);
    cons.push(` dp_${s.key}: ${d} - ${num(1 / ref)} ${s.key} >= ${num(-1)}`);
    cons.push(` dn_${s.key}: ${d} + ${num(1 / ref)} ${s.key} >= ${num(1)}`);
    bounds.push(` 0 <= ${d} <= 10`);
  }

  obj.push(`${PENALTY_KCAL} sk_p`, `${PENALTY_KCAL} sk_m`, `${PENALTY_PROTEIN} sp_m`);
  bounds.push(" 0 <= sk_p <= 100000", " 0 <= sk_m <= 100000", " 0 <= sp_m <= 100000");

  const kcalTerms = slots.map((s) => `${num(s.ing.nutrition.kcal / 100)} ${s.key}`);
  cons.push(` kcal: ${kcalTerms.join(" + ")} + sk_m - sk_p = ${num(target.kcal)}`);

  const protTerms = slots.map((s) => `${num(s.ing.nutrition.protein / 100)} ${s.key}`);
  cons.push(` prot: ${protTerms.join(" + ")} + sp_m >= ${num(target.proteinMin)}`);

  if (target.proteinMax !== undefined) {
    cons.push(` protmax: ${protTerms.join(" + ")} <= ${num(target.proteinMax)}`);
  }
  if (target.animalMinG !== undefined && target.animalMinG > 0) {
    const animalTerms = slots.filter((s) => s.ing.animal).map((s) => `${s.key}`);
    if (animalTerms.length > 0) {
      cons.push(` animal: ${animalTerms.join(" + ")} >= ${num(target.animalMinG)}`);
    }
  }
  if (target.fatMin !== undefined) {
    const fatTerms = slots.map((s) => `${num(s.ing.nutrition.fat / 100)} ${s.key}`);
    cons.push(` fat: ${fatTerms.join(" + ")} >= ${num(target.fatMin)}`);
  }

  return [
    "Minimize",
    ` obj: ${obj.join(" + ")}`,
    "Subject To",
    ...cons,
    "Bounds",
    ...bounds,
    "End",
  ].join("\n");
}

function totalsOf(slots: Slot[], grams: Record<string, number>): Macros {
  return sumMacros(
    slots.map((s) => macrosFor(s.ing.nutrition, grams[s.ing.conceptId] ?? 0)),
  );
}

/**
 * Résout les grammes d'un repas sous contrainte nutritionnelle ET culinaire.
 *
 * L'objectif minimise la déviation RELATIVE pondérée par la raideur de chaque
 * ingrédient : c'est ce qui empêche les portions absurdes. Les cibles sont
 * relâchables via des variables d'écart fortement pénalisées, pour que
 * l'infaisabilité soit rapportée honnêtement plutôt que maquillée.
 */
export function solveMeal(
  solver: LpSolver,
  ingredients: SolverIngredient[],
  target: SolverTarget,
  locked: Record<string, number> = {},
): SolverResult {
  const usable = ingredients.filter((i) => !i.optional || i.refG > 0);
  const slots = buildSlots(usable, locked);
  const model = buildModel(slots, target);
  const raw = solver.solve(model);

  const grams: Record<string, number> = {};
  for (const s of slots) {
    const value = raw.columns[s.key];
    grams[s.ing.conceptId] = weighable(value === undefined ? s.lo : Math.max(s.lo, Math.min(s.hi, value)));
  }

  const totals = totalsOf(slots, grams);
  const gapKcal = totals.kcal - target.kcal;
  const gapProtein = totals.protein - target.proteinMin;

  const kcalOff = Math.abs(gapKcal) > target.kcalTolerance;
  const proteinOff = gapProtein < -0.5;

  let status: SolverResult["status"] = "optimal";
  let message: string | null = null;
  if (raw.status !== "Optimal") {
    status = "infeasible";
    message = "the solver did not converge";
  } else if (kcalOff || proteinOff) {
    status = "relaxed";
    const parts: string[] = [];
    if (kcalOff) parts.push(`${gapKcal > 0 ? "+" : ""}${Math.round(gapKcal)} kcal`);
    if (proteinOff) parts.push(`${Math.round(gapProtein)} g protein`);
    message = `cannot hit this without leaving the culinary ranges: ${parts.join(", ")}`;
  }

  const moves = slots
    .filter((s) => !s.fixed)
    .map((s) => {
      const finalG = grams[s.ing.conceptId] ?? 0;
      return {
        conceptId: s.ing.conceptId,
        refG: s.ing.refG,
        finalG,
        deltaPct: s.ing.refG > 0 ? (finalG - s.ing.refG) / s.ing.refG : 0,
      };
    })
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

  return {
    status,
    grams,
    totals,
    gap: { kcal: gapKcal, protein: gapProtein },
    moves,
    message,
  };
}

/**
 * Quel ingrédient élargir pour combler l'écart, quand le solveur rend "relaxed".
 * On propose l'ingrédient qui rapproche le plus de la cible par gramme ajouté,
 * parmi ceux déjà collés à leur borne.
 */
export function suggestRelaxation(
  ingredients: SolverIngredient[],
  result: SolverResult,
): { conceptId: string; direction: "up" | "down"; reason: string } | null {
  if (result.status === "optimal") return null;
  const needMoreKcal = result.gap.kcal < 0;
  const needMoreProtein = result.gap.protein < 0;

  const candidates = ingredients
    .filter((i) => i.adjustable)
    .map((i) => {
      const g = result.grams[i.conceptId] ?? 0;
      const atMax = g >= i.maxG - 0.5;
      const atMin = g <= i.minG + 0.5;
      const value = needMoreProtein ? i.nutrition.protein : i.nutrition.kcal;
      return { i, atMax, atMin, value };
    })
    .filter((c) => (needMoreKcal || needMoreProtein ? c.atMax : c.atMin))
    .sort((a, b) => b.value - a.value);

  const best = candidates[0];
  if (!best) return null;
  return {
    conceptId: best.i.conceptId,
    direction: needMoreKcal || needMoreProtein ? "up" : "down",
    reason: needMoreProtein
      ? "it is the most protein-efficient ingredient already at its ceiling"
      : "it is the densest ingredient already at its bound",
  };
}
