import type {
  PlannedMeal,
  PlannerContext,
  PlannerRecipe,
  PlannerSlot,
  WeekPlan,
} from "./planner-types";
import { FatigueTracker } from "./fatigue";
import { scoreCandidate, achievableRange, maxProteinAtKcal, isEligible } from "./scoring";
import { makeRng, weightedPick } from "./rng";
import { planPurchase, orphanPenalty } from "./packaging";
import { macrosFor, sumMacros } from "./nutrition";
import type { Macros } from "./types";

const TOP_K = 5;
const LOCAL_SEARCH_ITERATIONS = 1500;

/**
 * Estimation rapide des grammes, sans solveur : on interpole entre les bornes
 * puis on pousse les ingrédients protéiques tant que la cible protéine n'est
 * pas tenue, en compensant sur les glucides pour rester à la cible calorique.
 * Le solveur exact prend le relais au moment de cuisiner.
 */
function estimateGrams(recipe: PlannerRecipe, slot: PlannerSlot): Record<string, number> {
  const range = achievableRange(recipe);
  const span = range.maxKcal - range.minKcal;
  const t = span <= 0 ? 0 : Math.max(0, Math.min(1, (slot.kcalTarget - range.minKcal) / span));
  const grams: Record<string, number> = {};
  for (const i of recipe.ingredients) {
    grams[i.conceptId] = i.adjustable ? i.minG + (i.maxG - i.minG) * t : i.refG;
  }

  const proteinOf = () =>
    recipe.ingredients.reduce((s, i) => s + (i.nutrition.protein * (grams[i.conceptId] ?? 0)) / 100, 0);
  const kcalOf = () =>
    recipe.ingredients.reduce((s, i) => s + (i.nutrition.kcal * (grams[i.conceptId] ?? 0)) / 100, 0);

  if (maxProteinAtKcal(recipe, slot.kcalTarget) < slot.proteinTarget) return grams;

  const protein = [...recipe.ingredients]
    .filter((i) => i.adjustable && i.nutrition.protein > 8)
    .sort((a, b) => b.nutrition.protein / Math.max(1, b.nutrition.kcal) - a.nutrition.protein / Math.max(1, a.nutrition.kcal));
  const carbs = [...recipe.ingredients]
    .filter((i) => i.adjustable && i.role === "carb_base")
    .sort((a, b) => b.nutrition.kcal - a.nutrition.kcal);

  for (let guard = 0; guard < 40 && proteinOf() < slot.proteinTarget; guard++) {
    const up = protein.find((i) => (grams[i.conceptId] ?? 0) < i.maxG - 0.5);
    if (!up) break;
    const step = Math.min(10, i_room(up));
    grams[up.conceptId] = (grams[up.conceptId] ?? 0) + step;
    let excess = kcalOf() - slot.kcalTarget;
    for (const down of carbs) {
      if (excess <= 0) break;
      const room = (grams[down.conceptId] ?? 0) - down.minG;
      if (room <= 0) continue;
      const cut = Math.min(room, (excess / Math.max(1, down.nutrition.kcal)) * 100);
      grams[down.conceptId] = (grams[down.conceptId] ?? 0) - cut;
      excess -= (cut * down.nutrition.kcal) / 100;
    }
  }

  function i_room(i: { conceptId: string; maxG: number }): number {
    return i.maxG - (grams[i.conceptId] ?? 0);
  }

  return grams;
}

function estimateMacros(recipe: PlannerRecipe, grams: Record<string, number>): Macros {
  return sumMacros(recipe.ingredients.map((i) => macrosFor(i.nutrition, grams[i.conceptId] ?? 0)));
}

function conceptTotals(
  meals: PlannedMeal[],
  recipeById: Map<string, PlannerRecipe>,
  slotById: Map<string, PlannerSlot>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const m of meals) {
    const recipe = recipeById.get(m.recipeId);
    const slot = slotById.get(m.slotId);
    if (!recipe || !slot) continue;
    const grams = estimateGrams(recipe, slot);
    for (const [id, g] of Object.entries(grams)) {
      totals.set(id, (totals.get(id) ?? 0) + g);
    }
  }
  return totals;
}

function weekPenalties(
  meals: PlannedMeal[],
  ctx: PlannerContext,
  recipeById: Map<string, PlannerRecipe>,
  slotById: Map<string, PlannerSlot>,
): { orphan: number; variety: number; budget: number; rigidity: number } {
  const totals = conceptTotals(meals, recipeById, slotById);
  const pantryByConcept = new Map<string, number>();
  for (const lot of ctx.pantry) {
    pantryByConcept.set(lot.conceptId, (pantryByConcept.get(lot.conceptId) ?? 0) + lot.grams);
  }

  const plans = [...totals.entries()].map(([conceptId, neededG]) => {
    const meta = ctx.concepts[conceptId];
    return planPurchase({
      conceptId,
      neededG,
      pantryG: pantryByConcept.get(conceptId) ?? 0,
      packageSizeG: meta?.packageG ?? null,
      boughtByWeight: meta?.boughtByWeight ?? false,
      openDays: meta?.openDays ?? null,
      freezable: meta?.freezable ?? false,
      horizonDays: 7,
    });
  });

  const orphan = orphanPenalty(plans);

  const cuisines = new Set<string>();
  const proteins = new Set<string>();
  const flavors = new Set<string>();
  for (const m of meals) {
    const r = recipeById.get(m.recipeId);
    if (!r) continue;
    cuisines.add(r.cuisine);
    for (const p of r.proteinConcepts) proteins.add(p);
    for (const f of r.flavorProfiles) flavors.add(f);
  }
  const dinners = meals.filter((m) => slotById.get(m.slotId)?.slot === "dinner").length || 1;
  const variety =
    Math.max(0, 4 - cuisines.size) * 0.7 +
    Math.max(0, 4 - proteins.size) * 0.9 +
    Math.max(0, 3 - flavors.size) * 0.4 +
    Math.max(0, dinners - meals.length) * 0;

  let budget = 0;
  if (ctx.weeklyBudgetCents !== null) {
    let cents = 0;
    for (const p of plans) {
      const meta = ctx.concepts[p.conceptId];
      if (!meta?.centsPerKg) continue;
      // Un produit de placard (huile, épices, riz, pâtes) dure des semaines :
      // on ne compte que ce qui est réellement consommé, pas le paquet entier.
      const billableG = meta.staple ? p.neededG : p.boughtG;
      cents += (billableG / 1000) * meta.centsPerKg;
    }
    const over = cents - ctx.weeklyBudgetCents;
    if (over > 0) budget = over / 220;
  }

  // Le panier est acheté une fois pour la semaine : il doit rester jouable quand
  // un jour bascule en « pressé » ou « dehors ». Une semaine qui n'a aucun plat
  // rapide ni aucun plat transportable ne se permute pas, elle se re-achète.
  let fast = 0;
  let portable = 0;
  for (const m of meals) {
    const r = recipeById.get(m.recipeId);
    const s = slotById.get(m.slotId);
    if (!r || !s) continue;
    if (s.slot === "dinner" && r.activeMinutes <= 25) fast++;
    if ((s.slot === "lunch" || s.slot === "breakfast") && r.portable) portable++;
  }
  const rigidity = Math.max(0, 3 - fast) * 0.8 + Math.max(0, 3 - portable) * 0.8;

  return { orphan, variety, budget, rigidity };
}

function totalScore(
  meals: PlannedMeal[],
  ctx: PlannerContext,
  recipeById: Map<string, PlannerRecipe>,
  slotById: Map<string, PlannerSlot>,
): { score: number; penalties: { orphan: number; variety: number; budget: number; rigidity: number } } {
  const base = meals.reduce((s, m) => s + m.score, 0);
  const penalties = weekPenalties(meals, ctx, recipeById, slotById);
  const distinct = conceptTotals(meals, recipeById, slotById).size;
  const shoppingLoad = Math.max(0, distinct - 45) * 0.55;
  const score =
    base -
    penalties.orphan * 3.2 -
    penalties.variety * 1.5 -
    penalties.budget -
    penalties.rigidity * 2.4 -
    shoppingLoad;
  return { score, penalties };
}

/**
 * Construction gloutonne randomisée puis recherche locale.
 *
 * On remplit d'abord les créneaux les plus contraints (cible protéine la plus
 * dure par kcal disponible), avec un tirage pondéré parmi les meilleurs
 * candidats plutôt que le maximum : c'est ce qui empêche la monotonie.
 */
export function planWeek(ctx: PlannerContext): WeekPlan {
  const rng = makeRng(ctx.seed);
  const recipeById = new Map(ctx.recipes.map((r) => [r.id, r]));
  const slotById = new Map(ctx.slots.map((s) => [s.id, s]));

  const order = [...ctx.slots].sort((a, b) => {
    const da = a.proteinTarget / Math.max(1, a.kcalTarget);
    const db = b.proteinTarget / Math.max(1, b.kcalTarget);
    if (db !== da) return db - da;
    return a.id.localeCompare(b.id);
  });

  const eligibleBySlot = new Map<string, PlannerRecipe[]>();
  for (const slot of ctx.slots) {
    eligibleBySlot.set(
      slot.id,
      ctx.recipes.filter((r) => isEligible(r, slot, ctx).ok),
    );
  }

  const fatigue = new FatigueTracker();
  const used = new Map<string, number>();
  const plannedIds = new Set<string>();
  const meals: PlannedMeal[] = [];
  const unfilled: string[] = [];

  for (const slot of order) {
    if (slot.locked && slot.lockedRecipeId) {
      const recipe = recipeById.get(slot.lockedRecipeId);
      if (recipe) {
        const grams = estimateGrams(recipe, slot);
        meals.push({
          slotId: slot.id,
          recipeId: recipe.id,
          score: 0,
          breakdown: { locked: 1 },
          estimate: estimateMacros(recipe, grams),
        });
        applyChoice(recipe, slot, fatigue, used, plannedIds, grams);
        continue;
      }
    }

    const scored = (eligibleBySlot.get(slot.id) ?? [])
      .map((r) => scoreCandidate(r, slot, ctx, fatigue, used, plannedIds))
      .filter((c) => c.feasible)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      unfilled.push(slot.id);
      continue;
    }

    const top = scored.slice(0, TOP_K);
    const best = top[0]!.score;
    const worst = top[top.length - 1]!.score;
    const spread = Math.max(0.001, best - worst);
    const picked = weightedPick(
      top.map((c) => ({ item: c, weight: Math.exp(((c.score - best) / spread) * 1.4) })),
      rng,
    );
    const choice = picked ?? top[0]!;
    const recipe = recipeById.get(choice.recipeId)!;
    const grams = estimateGrams(recipe, slot);
    meals.push({
      slotId: slot.id,
      recipeId: recipe.id,
      score: choice.score,
      breakdown: choice.breakdown,
      estimate: estimateMacros(recipe, grams),
    });
    applyChoice(recipe, slot, fatigue, used, plannedIds, grams);
  }

  // Créneaux de routine : on ne réinvente pas son petit-déjeuner sept fois.
  // On garde les deux meilleurs candidats du créneau et on alterne.
  const collapsed = collapseRoutines(meals, ctx, recipeById, slotById);

  let current = collapsed;
  let best = totalScore(current, ctx, recipeById, slotById);

  for (let iter = 0; iter < LOCAL_SEARCH_ITERATIONS; iter++) {
    if (current.length === 0) break;
    const idx = Math.floor(rng() * current.length);
    const target = current[idx]!;
    const slot = slotById.get(target.slotId);
    if (!slot || slot.locked) continue;
    if (ctx.routineSlots.has(slot.slot)) continue;

    const rebuilt = rescore(current, ctx, recipeById, slotById, idx, eligibleBySlot);
    const alternatives = rebuilt.filter((c) => c.feasible && c.recipeId !== target.recipeId);
    if (alternatives.length === 0) continue;
    const candidate = alternatives[Math.floor(rng() * Math.min(8, alternatives.length))];
    if (!candidate) continue;

    const recipe = recipeById.get(candidate.recipeId)!;
    const grams = estimateGrams(recipe, slot);
    const next = [...current];
    next[idx] = {
      slotId: slot.id,
      recipeId: recipe.id,
      score: candidate.score,
      breakdown: candidate.breakdown,
      estimate: estimateMacros(recipe, grams),
    };
    const nextScore = totalScore(next, ctx, recipeById, slotById);
    if (nextScore.score > best.score) {
      current = next;
      best = nextScore;
    }
  }

  const ordered = ctx.slots
    .map((s) => current.find((m) => m.slotId === s.id))
    .filter((m): m is PlannedMeal => m !== undefined);

  return { meals: ordered, score: best.score, penalties: best.penalties, unfilled };
}

/**
 * Ramène chaque créneau de routine à deux recettes alternées sur la semaine.
 * Le dîner reste varié : c'est le créneau plaisir. Le matin, la routine est le confort.
 */
function collapseRoutines(
  meals: PlannedMeal[],
  ctx: PlannerContext,
  recipeById: Map<string, PlannerRecipe>,
  slotById: Map<string, PlannerSlot>,
): PlannedMeal[] {
  const out = [...meals];
  for (const kind of ctx.routineSlots) {
    const group = out
      .map((m, index) => ({ m, index, slot: slotById.get(m.slotId) }))
      .filter((x) => x.slot?.slot === kind && !x.slot.locked);
    if (group.length < 3) continue;

    const byRecipe = new Map<string, number>();
    for (const g of group) byRecipe.set(g.m.recipeId, (byRecipe.get(g.m.recipeId) ?? 0) + g.m.score);
    const favourites = [...byRecipe.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id);
    if (favourites.length === 0) continue;

    group.forEach((g, i) => {
      const wanted = favourites[i % favourites.length] ?? favourites[0]!;
      if (g.m.recipeId === wanted) return;
      const recipe = recipeById.get(wanted);
      const slot = g.slot;
      if (!recipe || !slot) return;
      if (!isEligible(recipe, slot, ctx).ok) return;
      const grams = estimateGrams(recipe, slot);
      out[g.index] = {
        slotId: g.m.slotId,
        recipeId: wanted,
        score: g.m.score,
        breakdown: { ...g.m.breakdown, routine: 1 },
        estimate: estimateMacros(recipe, grams),
      };
    });
  }
  return out;
}

function applyChoice(
  recipe: PlannerRecipe,
  slot: PlannerSlot,
  fatigue: FatigueTracker,
  used: Map<string, number>,
  plannedIds: Set<string>,
  grams: Record<string, number>,
): void {
  fatigue.record("dish", recipe.id, slot.dayIndex);
  fatigue.record("cuisine", recipe.cuisine, slot.dayIndex);
  for (const p of recipe.proteinConcepts) fatigue.record("protein", p, slot.dayIndex);
  for (const f of recipe.flavorProfiles) fatigue.record("flavor", f, slot.dayIndex);
  for (const t of recipe.techniques) fatigue.record("technique", t, slot.dayIndex);
  plannedIds.add(recipe.id);
  for (const id of Object.keys(grams)) used.set(id, (used.get(id) ?? 0) + 1);
}

/** Recalcule les candidats pour un créneau, en tenant compte du reste de la semaine. */
function rescore(
  meals: PlannedMeal[],
  ctx: PlannerContext,
  recipeById: Map<string, PlannerRecipe>,
  slotById: Map<string, PlannerSlot>,
  skipIndex: number,
  eligibleBySlot?: Map<string, PlannerRecipe[]>,
) {
  const slot = slotById.get(meals[skipIndex]!.slotId)!;
  const fatigue = new FatigueTracker();
  const used = new Map<string, number>();
  const plannedIds = new Set<string>();

  for (let i = 0; i < meals.length; i++) {
    if (i === skipIndex) continue;
    const m = meals[i]!;
    const r = recipeById.get(m.recipeId);
    const s = slotById.get(m.slotId);
    if (!r || !s) continue;
    applyChoice(r, s, fatigue, used, plannedIds, estimateGrams(r, s));
  }

  const pool = eligibleBySlot?.get(slot.id) ?? ctx.recipes.filter((r) => isEligible(r, slot, ctx).ok);
  return pool
    .map((r) => scoreCandidate(r, slot, ctx, fatigue, used, plannedIds))
    .filter((c) => c.feasible)
    .sort((a, b) => b.score - a.score);
}

/** Trois alternatives pour un créneau, quand le plat proposé ne va pas. */
export function alternativesFor(
  ctx: PlannerContext,
  plan: WeekPlan,
  slotId: string,
  count = 3,
): { recipeId: string; score: number; breakdown: Record<string, number> }[] {
  const recipeById = new Map(ctx.recipes.map((r) => [r.id, r]));
  const slotById = new Map(ctx.slots.map((s) => [s.id, s]));
  const index = plan.meals.findIndex((m) => m.slotId === slotId);
  if (index === -1) return [];
  const current = plan.meals[index]!.recipeId;
  return rescore(plan.meals, ctx, recipeById, slotById, index)
    .filter((c) => c.recipeId !== current)
    .slice(0, count)
    .map((c) => ({ recipeId: c.recipeId, score: c.score, breakdown: c.breakdown }));
}

/** Lecture humaine du score : c'est l'écran « pourquoi ce plat ce soir ». */
export function explain(breakdown: Record<string, number>): string[] {
  const labels: Record<string, (v: number) => string> = {
    proteinFit: (v) => (v > 0 ? "easily hits the protein target" : "protein is tight for this slot"),
    taste: (v) => (v > 0 ? "you rate this kind of dish highly" : "not your usual thing"),
    nutritionFit: () => "quantities land mid-range, nothing is stretched",
    expiryUrgency: () => "uses what expires first",
    reuse: () => "reuses ingredients already bought this week",
    timeFit: (v) => (v < 0 ? "slightly longer than the slot allows" : "fits the cooking time"),
    fatigue: (v) => (v < -0.5 ? "you had something close recently" : "you have not had this in a while"),
    frequency: () => "past the weekly limit you set for an ingredient",
    complexity: () => "a bit technical",
    cost: (v) => (v < -0.4 ? "pricier than your usual meal budget" : "cheap for what it gives"),
    novelty: (v) => (v > 0 ? "new dish this week" : "already on the menu this week"),
    routine: () => "your regular for this slot, on purpose",
  };

  return Object.entries(breakdown)
    .filter(([, v]) => Math.abs(v) > 0.15)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5)
    .map(([k, v]) => labels[k]?.(v) ?? k);
}
