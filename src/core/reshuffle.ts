import type { PlannerContext, PlannerRecipe, PlannerSlot } from "./planner-types";
import { isEligible } from "./scoring";

export interface Cell {
  slotId: string;
  date: string;
  recipeId: string;
  cooked: boolean;
}

export interface Swap {
  slotA: string;
  slotB: string;
  recipeA: string;
  recipeB: string;
}

export interface Reshuffle {
  swaps: Swap[];
  unresolved: string[];
}

const TIME_SLACK_MIN = 5;

export function fitsSlot(recipe: PlannerRecipe, slot: PlannerSlot, ctx: PlannerContext): boolean {
  if (!isEligible(recipe, slot, ctx).ok) return false;
  return recipe.activeMinutes <= slot.maxMinutes + TIME_SLACK_MIN;
}

/**
 * Le panier de la semaine est déjà acheté : on ne change pas l'ensemble des plats,
 * on change l'ordre. Un jour qui devient chargé échange son plat avec un jour
 * plus calme, dans les deux sens, sinon l'échange est refusé.
 */
export function reshuffleDay(
  changedDate: string,
  cells: Cell[],
  slotsById: Map<string, PlannerSlot>,
  recipesById: Map<string, PlannerRecipe>,
  ctx: PlannerContext,
): Reshuffle {
  const swaps: Swap[] = [];
  const unresolved: string[] = [];
  const taken = new Set<string>();
  const current = new Map(cells.map((c) => [c.slotId, c.recipeId]));

  const misfits = cells.filter((c) => {
    if (c.cooked || c.date !== changedDate) return false;
    const slot = slotsById.get(c.slotId);
    const recipe = recipesById.get(c.recipeId);
    if (!slot || !recipe) return false;
    return !fitsSlot(recipe, slot, ctx);
  });

  for (const misfit of misfits) {
    const slotA = slotsById.get(misfit.slotId)!;
    const recipeA = recipesById.get(current.get(misfit.slotId)!)!;
    let best: { cell: Cell; gain: number } | null = null;

    for (const other of cells) {
      if (other.cooked || other.date === changedDate) continue;
      if (taken.has(other.slotId)) continue;
      const slotB = slotsById.get(other.slotId);
      const recipeB = recipesById.get(current.get(other.slotId)!);
      if (!slotB || !recipeB || slotB.slot !== slotA.slot) continue;
      if (!fitsSlot(recipeB, slotA, ctx)) continue;
      if (!fitsSlot(recipeA, slotB, ctx)) continue;
      // On garde l'échange le plus confortable des deux côtés, et le plus proche
      // dans la semaine : déplacer un plat de mardi à mercredi dérange moins.
      const slack =
        (slotA.maxMinutes - recipeB.activeMinutes) + (slotB.maxMinutes - recipeA.activeMinutes);
      const distance = Math.abs(slotB.dayIndex - slotA.dayIndex);
      const gain = slack - distance * 2;
      if (!best || gain > best.gain) best = { cell: other, gain };
    }

    if (!best) {
      unresolved.push(misfit.slotId);
      continue;
    }
    const recipeB = current.get(best.cell.slotId)!;
    swaps.push({
      slotA: misfit.slotId,
      slotB: best.cell.slotId,
      recipeA: recipeA.id,
      recipeB,
    });
    current.set(misfit.slotId, recipeB);
    current.set(best.cell.slotId, recipeA.id);
    taken.add(best.cell.slotId);
  }

  return { swaps, unresolved };
}

/**
 * Repli quand aucun échange ne marche : on ne pioche que dans ce qui est
 * déjà au frigo, sinon il faudrait retourner faire des courses.
 */
export function coveredByStock(
  recipe: PlannerRecipe,
  stock: Map<string, number>,
  ctx: PlannerContext,
): boolean {
  for (const ing of recipe.ingredients) {
    if (ing.optional) continue;
    if (ctx.concepts[ing.conceptId]?.staple) continue;
    if ((stock.get(ing.conceptId) ?? 0) < ing.minG) return false;
  }
  return true;
}
