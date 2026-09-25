import type { PlannerContext, PlannerRecipe, PlannerSlot, ScoredCandidate } from "./planner-types";
import type { FatigueTracker } from "./fatigue";

export interface Achievable {
  minKcal: number;
  maxKcal: number;
  minProtein: number;
  maxProtein: number;
}

/**
 * Plage nutritionnelle atteignable par une recette, bornes culinaires comprises.
 * Condition nécessaire de faisabilité, calculée en O(n) sans appeler le solveur.
 */
export function achievableRange(recipe: PlannerRecipe): Achievable {
  let minKcal = 0;
  let maxKcal = 0;
  let minProtein = 0;
  let maxProtein = 0;
  for (const i of recipe.ingredients) {
    const lo = i.adjustable ? i.minG : i.refG;
    const hi = i.adjustable ? i.maxG : i.refG;
    minKcal += (i.nutrition.kcal * lo) / 100;
    maxKcal += (i.nutrition.kcal * hi) / 100;
    minProtein += (i.nutrition.protein * lo) / 100;
    maxProtein += (i.nutrition.protein * hi) / 100;
  }
  return { minKcal, maxKcal, minProtein, maxProtein };
}


/**
 * Protéines maximales atteignables en respectant EXACTEMENT la cible calorique.
 * Allocation gloutonne par densité protéique par kcal : c'est une borne haute
 * fidèle, calculée sans appeler le solveur, et c'est ce qui empêche le
 * planificateur de choisir un plat qui ne tiendra jamais la cible protéine.
 */
const proteinCache = new Map<string, number>();

export function maxProteinAtKcal(recipe: PlannerRecipe, kcalTarget: number): number {
  const key = `${recipe.id}|${Math.round(kcalTarget)}`;
  const hit = proteinCache.get(key);
  if (hit !== undefined) return hit;
  const value = computeMaxProteinAtKcal(recipe, kcalTarget);
  proteinCache.set(key, value);
  return value;
}

function computeMaxProteinAtKcal(recipe: PlannerRecipe, kcalTarget: number): number {
  const items = recipe.ingredients.map((i) => ({
    lo: i.adjustable ? i.minG : i.refG,
    hi: i.adjustable ? i.maxG : i.refG,
    kcal: i.nutrition.kcal / 100,
    prot: i.nutrition.protein / 100,
  }));

  let kcal = 0;
  let protein = 0;
  const grams = items.map((it) => {
    kcal += it.kcal * it.lo;
    protein += it.prot * it.lo;
    return it.lo;
  });

  if (kcal > kcalTarget) return protein;

  const ranked = items
    .map((it, idx) => ({ idx, it, ratio: it.kcal > 0 ? it.prot / it.kcal : Infinity }))
    .sort((a, b) => b.ratio - a.ratio);

  let budget = kcalTarget - kcal;
  for (const { idx, it } of ranked) {
    if (budget <= 0) break;
    const room = it.hi - grams[idx]!;
    if (room <= 0) continue;
    if (it.kcal <= 0) {
      grams[idx] = it.hi;
      protein += it.prot * room;
      continue;
    }
    const affordable = Math.min(room, budget / it.kcal);
    grams[idx] = grams[idx]! + affordable;
    protein += it.prot * affordable;
    budget -= affordable * it.kcal;
  }
  return protein;
}

/**
 * Coût d'un repas, en centimes, aux quantités attendues pour ce créneau.
 * Les prix viennent des achats de default-user dès qu'il en a, des prix de
 * référence français sinon. Un boeuf à braiser doit coûter ce qu'il coûte.
 */
export function mealCostCents(
  recipe: PlannerRecipe,
  slot: PlannerSlot,
  concepts: PlannerContext["concepts"],
): number {
  const range = achievableRange(recipe);
  const span = Math.max(1, range.maxKcal - range.minKcal);
  const t = Math.max(0, Math.min(1, (slot.kcalTarget - range.minKcal) / span));
  let cents = 0;
  for (const i of recipe.ingredients) {
    const grams = i.adjustable ? i.minG + (i.maxG - i.minG) * t : i.refG;
    const perKg = concepts[i.conceptId]?.centsPerKg;
    if (!perKg) continue;
    cents += (grams / 1000) * perKg;
  }
  return Math.round(cents);
}

/**
 * Calories minimales une fois la portion de viande imposée.
 * Sans ça le planificateur retient des recettes qui ne peuvent PAS tenir
 * la cible calorique avec 300 g de viande dedans, et le solveur sort en « relaxed ».
 */
export function minKcalWithAnimal(recipe: PlannerRecipe, animalMinG: number): number {
  let kcal = 0;
  let animalSoFar = 0;
  const rest: { kcalPerG: number; room: number }[] = [];

  for (const i of recipe.ingredients) {
    const lo = i.adjustable ? i.minG : i.refG;
    const hi = i.adjustable ? i.maxG : i.refG;
    kcal += (i.nutrition.kcal * lo) / 100;
    if (i.animal) {
      animalSoFar += lo;
      if (hi > lo) rest.push({ kcalPerG: i.nutrition.kcal / 100, room: hi - lo });
    }
  }
  let missing = animalMinG - animalSoFar;
  if (missing <= 0) return kcal;

  // On complète avec la viande la MOINS calorique disponible : c'est la borne basse honnête.
  rest.sort((a, b) => a.kcalPerG - b.kcalPerG);
  for (const r of rest) {
    if (missing <= 0) break;
    const take = Math.min(r.room, missing);
    kcal += take * r.kcalPerG;
    missing -= take;
  }
  return missing > 0 ? Infinity : kcal;
}

export const WEIGHTS = {
  taste: 3.0,
  nutritionFit: 1.6,
  expiryUrgency: 2.2,
  reuse: 3.2,
  timeFit: 1.0,
  fatigue: 2.6,
  frequency: 1.8,
  complexity: 0.5,
  novelty: 0.45,
  proteinFit: 3.4,
  cost: 4.2,
} as const;

function meanAffinity(recipe: PlannerRecipe, affinity: Record<string, number>): number {
  const weighted = recipe.ingredients.filter(
    (i) => i.role === "protein_core" || i.role === "carb_base" || i.role === "vegetable_bulk",
  );
  if (weighted.length === 0) return 0;
  let sum = 0;
  for (const i of weighted) sum += affinity[i.conceptId] ?? 0;
  return sum / weighted.length;
}

export function isEligible(
  recipe: PlannerRecipe,
  slot: PlannerSlot,
  ctx: PlannerContext,
): { ok: boolean; reason?: string } {
  if (!recipe.slotKinds.includes(slot.slot)) return { ok: false, reason: "mauvais créneau" };
  for (const c of recipe.ingredients) {
    if (ctx.banned.has(c.conceptId) && !c.optional) {
      return { ok: false, reason: `contient ${c.conceptId}, marqué jamais` };
    }
  }
  for (const e of recipe.equipmentRequired) {
    if (!ctx.equipment.has(e)) return { ok: false, reason: `équipement manquant : ${e}` };
  }
  if (recipe.spiceLevel > ctx.spiceTolerance) return { ok: false, reason: "trop épicé" };
  if (slot.portable && !recipe.portable) {
    return { ok: false, reason: "ne se transporte pas" };
  }
  if (ctx.mainSlots.has(slot.slot) && ctx.meatPerMainMealG > 0) {
    if (recipe.animalProteinMaxG < ctx.meatPerMainMealG) {
      return { ok: false, reason: "pas assez de viande ou de poisson pour un repas principal" };
    }
    const floor = minKcalWithAnimal(recipe, ctx.meatPerMainMealG);
    if (slot.kcalTarget < floor * 0.97) {
      return { ok: false, reason: "trop calorique une fois la portion de viande imposée" };
    }
  }
  if (recipe.pansNeeded > ctx.maxPans) return { ok: false, reason: "trop de casseroles" };
  const range = achievableRange(recipe);
  if (slot.kcalTarget < range.minKcal * 0.82) return { ok: false, reason: "trop calorique pour ce créneau" };
  if (slot.kcalTarget > range.maxKcal * 1.18) return { ok: false, reason: "pas assez calorique pour ce créneau" };
  if (slot.proteinTarget > range.maxProtein * 1.1) return { ok: false, reason: "pas assez de protéines" };
  if (maxProteinAtKcal(recipe, slot.kcalTarget) < slot.proteinTarget * 0.6) {
    return { ok: false, reason: "impossible d'atteindre la cible protéine à cette densité" };
  }
  return { ok: true };
}

export function scoreCandidate(
  recipe: PlannerRecipe,
  slot: PlannerSlot,
  ctx: PlannerContext,
  fatigue: FatigueTracker,
  usedConcepts: Map<string, number>,
  plannedRecipeIds: Set<string>,
): ScoredCandidate {
  const eligible = isEligible(recipe, slot, ctx);
  if (!eligible.ok) {
    return { recipeId: recipe.id, score: -Infinity, breakdown: {}, feasible: false, reason: eligible.reason };
  }

  const range = achievableRange(recipe);
  const span = Math.max(1, range.maxKcal - range.minKcal);
  const centered = 1 - Math.min(1, Math.abs(slot.kcalTarget - (range.minKcal + range.maxKcal) / 2) / span);

  const elo = ctx.dishElo[recipe.id] ?? 1500;
  const tasteFromElo = (elo - 1500) / 400;
  const taste = 0.55 * tasteFromElo + 0.45 * meanAffinity(recipe, ctx.affinity);

  let expiry = 0;
  for (const lot of ctx.pantry) {
    if (lot.daysToExpiry === null) continue;
    const uses = recipe.ingredients.some((i) => i.conceptId === lot.conceptId);
    if (!uses) continue;
    const urgency = Math.max(0, 1 - lot.daysToExpiry / 7);
    expiry += urgency * Math.min(1, lot.grams / 200);
  }

  let reuse = 0;
  for (const i of recipe.ingredients) {
    const count = usedConcepts.get(i.conceptId) ?? 0;
    if (count === 0) continue;
    const meta = ctx.concepts[i.conceptId];
    const perishable = meta && meta.openDays !== null && meta.openDays <= 7;
    reuse += perishable ? 0.42 : 0.16;
  }
  reuse = Math.min(3, reuse);

  const over = Math.max(0, recipe.activeMinutes - slot.maxMinutes);
  const timeFit = -over / 20;

  const day = slot.dayIndex;
  const dishFatigue = fatigue.level("dish", recipe.id, day);
  const cuisineFatigue = fatigue.level("cuisine", recipe.cuisine, day);
  let proteinFatigue = 0;
  for (const p of recipe.proteinConcepts) proteinFatigue = Math.max(proteinFatigue, fatigue.level("protein", p, day));
  let flavorFatigue = 0;
  for (const f of recipe.flavorProfiles) flavorFatigue = Math.max(flavorFatigue, fatigue.level("flavor", f, day));
  const routineSlot = ctx.routineSlots.has(slot.slot);
  const fatiguePenalty = routineSlot
    ? dishFatigue * 0.1 + proteinFatigue * 0.2 + cuisineFatigue * 0.1 + flavorFatigue * 0.1
    : dishFatigue * 1.0 + proteinFatigue * 0.75 + cuisineFatigue * 0.6 + flavorFatigue * 0.45;

  let frequencyPenalty = 0;
  for (const i of recipe.ingredients) {
    const cap = ctx.frequencyPerWeek[i.conceptId];
    if (cap === undefined) continue;
    const used = usedConcepts.get(i.conceptId) ?? 0;
    if (used >= cap) frequencyPenalty += 0.6 + (used - cap) * 0.4;
  }

  const complexity = (recipe.difficulty - 2) * 0.3 + Math.max(0, recipe.pansNeeded - 2) * 0.4;

  let costPenalty = 0;
  if (ctx.budgetPerMealCents !== null) {
    const cents = mealCostCents(recipe, slot, ctx.concepts);
    const share = slot.kcalTarget / Math.max(1, ctx.slots.reduce((s, x) => s + x.kcalTarget, 0) / ctx.slots.length);
    const allowance = ctx.budgetPerMealCents * share;
    if (cents > allowance) costPenalty = (cents - allowance) / Math.max(80, allowance);
  }
  // Sur un créneau de routine, répéter est une QUALITÉ : on veut le même petit-déjeuner.
  const routine = ctx.routineSlots.has(slot.slot);
  const novelty = plannedRecipeIds.has(recipe.id) ? (routine ? 2.2 : -1.5) : routine ? -0.2 : 0.25;

  const reachableProtein = maxProteinAtKcal(recipe, slot.kcalTarget);
  const proteinFit = Math.min(1.25, reachableProtein / Math.max(1, slot.proteinTarget));

  const breakdown: Record<string, number> = {
    proteinFit: WEIGHTS.proteinFit * (proteinFit - 0.85),
    taste: WEIGHTS.taste * taste,
    nutritionFit: WEIGHTS.nutritionFit * centered,
    expiryUrgency: WEIGHTS.expiryUrgency * expiry,
    reuse: WEIGHTS.reuse * reuse,
    timeFit: WEIGHTS.timeFit * timeFit,
    fatigue: -WEIGHTS.fatigue * fatiguePenalty,
    frequency: -WEIGHTS.frequency * frequencyPenalty,
    complexity: -WEIGHTS.complexity * complexity,
    cost: -WEIGHTS.cost * costPenalty,
    novelty: WEIGHTS.novelty * novelty,
  };

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { recipeId: recipe.id, score, breakdown, feasible: true };
}
