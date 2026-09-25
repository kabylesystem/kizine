import { rawDb } from "@/db/client";
import { normalizeSplit, type KcalSplit } from "@/core/schedule";

import { currentUserId } from "./auth";

/** Compte historique, gardé pour les scripts qui tournent hors requête HTTP. */
export const OWNER_ID = "default-user";

export interface Profile {
  kcalTarget: number;
  proteinTargetG: number;
  fatMinG: number;
  dailyToleranceKcal: number;
  shoppingWeekday: number;
  weekStartsOn: number;
  cookMinutesWeekday: number;
  cookMinutesWeekend: number;
  maxPans: number;
  spiceTolerance: number;
  leftoverTolerance: number;
  freezerLiters: number;
  weeklyBudgetEur: number | null;
  bodyWeightKg: number | null;
  meatPerMainMealG: number;
  breakfastDaysPerWeek: number;
  snackDaysPerWeek: number;
  /** Répartition des calories entre les repas choisie dans les paramètres, sinon null. */
  kcalSplit: KcalSplit | null;
  goalKind: "bulk" | "bulkFast" | "maintain" | "cut";
  onboarded: boolean;
}

export async function getProfile(): Promise<Profile | null> {
  const db = rawDb();
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(await currentUserId()) as
    | { onboarded_at: number | null }
    | undefined;
  if (!user) return null;
  const p = await db.prepare("SELECT * FROM nutrition_profiles WHERE user_id = ?").get(await currentUserId()) as
    | Record<string, number | null>
    | undefined;
  if (!p) return null;
  return {
    kcalTarget: Number(p["kcal_target"]),
    proteinTargetG: Number(p["protein_target_g"]),
    fatMinG: Number(p["fat_min_g"]),
    dailyToleranceKcal: Number(p["daily_tolerance_kcal"]),
    shoppingWeekday: Number(p["shopping_weekday"]),
    weekStartsOn: Number(p["week_starts_on"] ?? 1),
    cookMinutesWeekday: Number(p["cook_minutes_weekday"]),
    cookMinutesWeekend: Number(p["cook_minutes_weekend"]),
    maxPans: Number(p["max_pans"]),
    spiceTolerance: Number(p["spice_tolerance"]),
    leftoverTolerance: Number(p["leftover_tolerance"]),
    freezerLiters: Number(p["freezer_liters"]),
    weeklyBudgetEur: p["weekly_budget_eur"] === null ? null : Number(p["weekly_budget_eur"]),
    bodyWeightKg: p["body_weight_kg"] === null ? null : Number(p["body_weight_kg"]),
    meatPerMainMealG: Number(p["meat_per_main_meal_g"] ?? 200),
    breakfastDaysPerWeek: Number(p["breakfast_days_per_week"] ?? 7),
    snackDaysPerWeek: Number(p["snack_days_per_week"] ?? 7),
    kcalSplit: parseSplit(p["kcal_split"]),
    goalKind: (String(p["goal_kind"] ?? "bulkFast") as "bulk" | "bulkFast" | "maintain" | "cut"),
    onboarded: user.onboarded_at !== null,
  };
}

function parseSplit(raw: unknown): KcalSplit | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return normalizeSplit(JSON.parse(raw) as Record<string, number>);
  } catch {
    return null;
  }
}

export async function getEquipment(): Promise<Set<string>> {
  const rows = await rawDb()
    .prepare("SELECT kind FROM equipment WHERE user_id = ? AND present = 1")
    .all(await currentUserId()) as unknown as { kind: string }[];
  return new Set(rows.map((r) => r.kind));
}

export interface StoredDayProfile {
  weekday: number;
  label: string;
  context: string;
  mealSlots: {
    slot: string;
    label: string;
    kcalShare: number;
    proteinShare: number;
    portable: boolean;
    maxMinutes: number;
  }[];
}

export async function getDayProfiles(): Promise<StoredDayProfile[]> {
  const rows = await rawDb()
    .prepare("SELECT weekday, label, context, meal_slots FROM day_profiles WHERE user_id = ? ORDER BY weekday")
    .all(await currentUserId()) as unknown as { weekday: number; label: string; context: string; meal_slots: string }[];
  return rows.map((r) => ({
    weekday: r.weekday,
    label: r.label,
    context: r.context,
    mealSlots: JSON.parse(r.meal_slots) as StoredDayProfile["mealSlots"],
  }));
}

export async function getPreferences(): Promise<{
  affinity: Record<string, number>;
  banned: Set<string>;
  frequency: Record<string, number>;
}> {
  const rows = await rawDb()
    .prepare("SELECT concept_id, affinity, affinity_score, frequency_per_week FROM preferences WHERE user_id = ?")
    .all(await currentUserId()) as unknown as {
    concept_id: string;
    affinity: string;
    affinity_score: number;
    frequency_per_week: number | null;
  }[];
  const affinity: Record<string, number> = {};
  const banned = new Set<string>();
  const frequency: Record<string, number> = {};
  for (const r of rows) {
    affinity[r.concept_id] = r.affinity_score;
    if (r.affinity === "never") banned.add(r.concept_id);
    if (r.frequency_per_week !== null) frequency[r.concept_id] = r.frequency_per_week;
  }
  return { affinity, banned, frequency };
}

export async function getDishElo(): Promise<Record<string, number>> {
  const rows = await rawDb()
    .prepare("SELECT recipe_id, elo FROM dish_ratings WHERE user_id = ?")
    .all(await currentUserId()) as unknown as { recipe_id: string; elo: number }[];
  return Object.fromEntries(rows.map((r) => [r.recipe_id, r.elo]));
}

export async function getPantry(): Promise<{ conceptId: string; grams: number; daysToExpiry: number | null; }[]> {
  const rows = await rawDb()
    .prepare("SELECT concept_id, quantity_g, best_before FROM pantry_items WHERE user_id = ? AND quantity_g > 0")
    .all(await currentUserId()) as unknown as { concept_id: string; quantity_g: number; best_before: string | null }[];
  const today = Date.now();
  return rows.map((r) => ({
    conceptId: r.concept_id,
    grams: r.quantity_g,
    daysToExpiry: r.best_before ? Math.round((Date.parse(r.best_before) - today) / 86400000) : null,
  }));
}

/** Les jours où il a retiré la collation à la main. */
export async function getNoSnackDates(): Promise<Set<string>> {
  const rows = (await rawDb()
    .prepare("SELECT date FROM day_overrides WHERE user_id = ? AND no_snack = 1")
    .all(await currentUserId())) as unknown as { date: string }[];
  return new Set(rows.map((r) => String(r.date)));
}
