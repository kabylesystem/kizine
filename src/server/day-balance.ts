import { currentUserId } from "@/server/auth";
import { rawDb } from "@/db/client";
import { isFreeRecipe } from "@/server/free-dish";

export interface DayBalance {
  date: string;
  target: number;
  planned: number;
  eaten: number;
  /** Ce qui manque une fois les repas sautés retirés. Négatif = en trop. */
  gapKcal: number;
  gapProtein: number;
  /** Part de « mangé » qui vient d'entrées estimées (plat connu ou à la louche). */
  roughEaten: number;
  /** Fourchette plausible de ce qui a été mangé, d'après la confiance de chaque entrée. */
  eatenLow: number;
  eatenHigh: number;
  eatenProtein: number;
  proteinLow: number;
  openProtein: number;
  /** Calories des repas comptés, pas encore mangés. */
  openKcal: number;
  /** Créneaux encore ouverts aujourd'hui, sur lesquels on peut rattraper. */
  open: { slotId: string; slot: string; title: string; kcal: number }[];
  skipped: { slotId: string; slot: string; title: string; kcal: number; reason: string | null }[];
}

/**
 * Ce que la journée pèse VRAIMENT une fois les repas sautés retirés.
 * Sauter un déjeuner à 1400 kcal fait un trou que rien ne rattrape tout seul :
 * il faut le voir, et pouvoir le combler sur un repas encore à faire.
 */
export async function dayBalance(date: string, target: number): Promise<DayBalance | null> {
  const rows = (await rawDb()
    .prepare(
      `SELECT s.id AS slot_id, s.slot, m.state, m.skip_reason, ri.recipe_id, ri.precision, ri.solver_status,
              COALESCE(r.title_en, r.title) AS title, ri.kcal, ri.protein_g
       FROM meal_slots s
       JOIN meal_plans p ON p.id = s.plan_id
       JOIN meals m ON m.slot_id = s.id
       JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       JOIN recipes r ON r.id = ri.recipe_id
       WHERE p.user_id = ? AND s.date = ?
       ORDER BY CASE s.slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 ELSE 3 END`,
    )
    .all((await currentUserId()), date)) as {
    slot_id: string;
    slot: string;
    state: string;
    skip_reason: string | null;
    recipe_id: string;
    precision: string | null;
    solver_status: string;
    title: string;
    kcal: number;
    protein_g: number;
  }[];
  if (rows.length === 0) return null;

  const counted = rows.filter((r) => r.state !== "skipped" && r.state !== "eating_out");
  const planned = counted.reduce((s, r) => s + Number(r.kcal), 0);
  const cooked = rows.filter((r) => r.state === "cooked");
  // Pesé : ±5 %. Plat connu ou produit : ±15 %. À la louche : ±30 %.
  const spread = (r: (typeof rows)[number]) => {
    const p = r.precision ?? (r.solver_status === "exact" ? "exact" : isFreeRecipe(r.recipe_id) ? "known" : "known");
    return p === "exact" ? 0.05 : p === "rough" ? 0.3 : 0.15;
  };
  const eaten = cooked.reduce((s, r) => s + Number(r.kcal), 0);
  const roughEaten = cooked.filter((r) => spread(r) > 0.05).reduce((s, r) => s + Number(r.kcal), 0);
  const eatenLow = cooked.reduce((s, r) => s + Number(r.kcal) * (1 - spread(r)), 0);
  const eatenHigh = cooked.reduce((s, r) => s + Number(r.kcal) * (1 + spread(r)), 0);
  const eatenProtein = cooked.reduce((s, r) => s + Number(r.protein_g), 0);
  const proteinLow = cooked.reduce((s, r) => s + Number(r.protein_g) * (1 - spread(r)), 0);
  const openRows = counted.filter((r) => r.state !== "cooked");
  const openKcal = openRows.reduce((s, r) => s + Number(r.kcal), 0);
  const openProtein = openRows.reduce((s, r) => s + Number(r.protein_g), 0);
  const protein = counted.reduce((s, r) => s + Number(r.protein_g), 0);

  return {
    date,
    target,
    planned: Math.round(planned),
    eaten: Math.round(eaten),
    gapKcal: Math.round(target - planned),
    gapProtein: Math.round(protein),
    roughEaten: Math.round(roughEaten),
    eatenLow: Math.round(eatenLow),
    eatenHigh: Math.round(eatenHigh),
    eatenProtein: Math.round(eatenProtein),
    proteinLow: Math.round(proteinLow),
    openProtein: Math.round(openProtein),
    openKcal: Math.round(openKcal),
    open: counted
      .filter((r) => r.state !== "cooked")
      .map((r) => ({ slotId: r.slot_id, slot: r.slot, title: r.title, kcal: Math.round(Number(r.kcal)) })),
    skipped: rows
      .filter((r) => r.state === "skipped")
      .map((r) => ({
        slotId: r.slot_id,
        slot: r.slot,
        title: r.title,
        kcal: Math.round(Number(r.kcal)),
        reason: r.skip_reason,
      })),
  };
}
