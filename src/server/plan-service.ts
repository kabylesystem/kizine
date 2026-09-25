import { currentUserId } from "@/server/auth";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rawDb } from "@/db/client";
import { loadConcepts, loadNutrition, loadRecipes, type LoadedRecipe } from "@/db/repo";
import { addDays, buildSlots, defaultDayProfiles, type DayProfile } from "@/core/schedule";
import { planWeek } from "@/core/planner";
import type { PlannerContext, PlannerSlot } from "@/core/planner-types";
import { getDayProfiles, getDishElo, getEquipment, getNoSnackDates, getPantry, getPreferences, getProfile } from "./user";
import { loadHighs } from "@/core/highs";
import { solveMeal } from "@/core/solver";
import type { SlotKind } from "@/core/types";

/**
 * Début de la semaine de default-user. Le calendrier commence lundi, mais un
 * cycle de courses commence le jour où l'on fait les courses : le réglage
 * `week_starts_on` décide, lundi par défaut.
 */
export function mondayOf(date = new Date(), startsOn = 1): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((day - startsOn + 7) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * La semaine qu'on est en train de PLANIFIER, pas celle du calendrier.
 * Le dimanche, la semaine en cours est finie : c'est la suivante qui compte,
 * c'est elle qu'on va acheter.
 */
export function planningWeekOf(date = new Date(), startsOn = 1): string {
  const start = mondayOf(date, startsOn);
  // On fait les courses le jour où le cycle redémarre. Deux jours avant, c'est
  // déjà le cycle SUIVANT qu'on prépare : acheter pour trois jours qui restent
  // n'a aucun sens.
  const daysUntilNext = (startsOn - date.getUTCDay() + 7) % 7;
  return daysUntilNext > 0 && daysUntilNext <= 2 ? addWeeks(start, 1) : start;
}

/** Les deux versions qui lisent son réglage, à utiliser partout dans les pages. */
export async function currentWeek(date = new Date()): Promise<string> {
  const profile = await getProfile();
  return mondayOf(date, profile?.weekStartsOn ?? 1);
}

export async function planningWeek(date = new Date()): Promise<string> {
  const profile = await getProfile();
  return planningWeekOf(date, profile?.weekStartsOn ?? 1);
}

export function addWeeks(weekStart: string, delta: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return d.toISOString().slice(0, 10);
}

export async function buildContext(
  weekStart: string,
  seed: number,
): Promise<{ ctx: PlannerContext; recipes: LoadedRecipe[] }> {
  // Tout ce qui ne dépend de rien part en même temps : chaque requête est un
  // aller-retour réseau vers Turso, les enchaîner coûtait plus d'une seconde.
  const [profile, index, concepts, stored, prefs, dishElo, equipment, pantry, noSnack] = await Promise.all([
    getProfile(),
    loadNutrition(),
    loadConcepts(),
    getDayProfiles(),
    getPreferences(),
    getDishElo(),
    getEquipment(),
    getPantry(),
    getNoSnackDates(),
  ]);
  if (!profile) throw new Error("profil absent : lance l'onboarding");
  const recipes = await loadRecipes(index);
  const dayProfiles: DayProfile[] =
    stored.length === 7
      ? stored.map((d) => ({
          weekday: d.weekday,
          label: d.label,
          context: d.context,
          mealSlots: d.mealSlots.map((m) => ({ ...m, slot: m.slot as SlotKind })),
        }))
      : defaultDayProfiles();

  const slots = buildSlots({
    weekStart,
    dayProfiles,
    kcalTarget: profile.kcalTarget,
    proteinTarget: profile.proteinTargetG,
    dailyToleranceKcal: profile.dailyToleranceKcal,
    shoppingWeekday: profile.shoppingWeekday,
    owner: await currentUserId(),
    breakfastDays: profile.breakfastDaysPerWeek,
    snackDays: profile.snackDaysPerWeek,
    noSnackDates: noSnack,
    kcalSplit: profile.kcalSplit,
  });

  const ctx: PlannerContext = {
    slots,
    recipes,
    affinity: prefs.affinity,
    banned: prefs.banned,
    dishElo,
    frequencyPerWeek: prefs.frequency,
    equipment,
    spiceTolerance: profile.spiceTolerance,
    maxPans: profile.maxPans,
    pantry,
    concepts,
    routineSlots: new Set<SlotKind>(["breakfast", "snack"]),
    mainSlots: new Set<SlotKind>(["lunch", "dinner"]),
    meatPerMainMealG: profile.meatPerMainMealG,
    weeklyBudgetCents: profile.weeklyBudgetEur === null ? null : Math.round(profile.weeklyBudgetEur * 100),
    budgetPerMealCents:
      profile.weeklyBudgetEur === null || slots.length === 0
        ? null
        : Math.round((profile.weeklyBudgetEur * 100) / slots.length),
    seed,
  };
  return { ctx, recipes };
}

export async function generateAndStorePlan(weekStart: string, seed = Math.floor(Math.random() * 1e9)): Promise<string> {
  const { ctx } = await buildContext(weekStart, seed);
  const plan = planWeek(ctx);
  const db = rawDb();
  const planId = randomUUID();

  // Le planificateur ESTIME pour aller vite ; le solveur TRANCHE.
  // On résout chaque repas retenu avant de l'écrire, pour que les kcal affichées
  // soient les vraies, pas une interpolation.
  const solver = await loadHighs(join(process.cwd(), "node_modules", "highs", "build"));
  const recipeById = new Map(ctx.recipes.map((r) => [r.id, r]));
  const slotById = new Map(ctx.slots.map((s) => [s.id, s]));
  const exact = new Map<string, { grams: Record<string, number>; totals: typeof plan.meals[number]["estimate"]; status: string }>();
  for (const meal of plan.meals) {
    const recipe = recipeById.get(meal.recipeId);
    const slot = slotById.get(meal.slotId);
    if (!recipe || !slot) continue;
    const solved = solveMeal(solver, recipe.ingredients, {
      kcal: slot.kcalTarget,
      kcalTolerance: 25,
      proteinMin: slot.proteinTarget,
      animalMinG: ctx.mainSlots.has(slot.slot) ? ctx.meatPerMainMealG : 0,
    });
    exact.set(meal.slotId, { grams: solved.grams, totals: solved.totals, status: solved.status });
  }

  try {
    await db.tx(async (trx) => {
      const existing = (await trx.prepare("SELECT id FROM meal_plans WHERE user_id = ? AND week_start = ?")
        .get((await currentUserId()), weekStart)) as { id: string } | undefined;
      if (existing) await trx.prepare("DELETE FROM meal_plans WHERE id = ?").run(existing.id);

      // L'identifiant d'un créneau est `date:repas`. Si le premier jour de la
      // semaine change, deux plans se disputent les mêmes dates et l'insertion
      // casse. Un jour n'appartient qu'à un plan : on libère la plage d'abord.
      const lastDay = addDays(weekStart, 6);
      await trx
        .prepare(
          `DELETE FROM meal_slots WHERE date BETWEEN ? AND ?
             AND plan_id IN (SELECT id FROM meal_plans WHERE user_id = ?)`,
        )
        .run(weekStart, lastDay, (await currentUserId()));
      // Un plan devenu vide n'a plus de raison d'être.
      await trx
        .prepare(
          `DELETE FROM meal_plans WHERE user_id = ?
             AND id NOT IN (SELECT DISTINCT plan_id FROM meal_slots)`,
        )
        .run((await currentUserId()));

      await trx.prepare(
        "INSERT INTO meal_plans (id, user_id, week_start, seed, status, score, score_breakdown, created_at) VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        planId,
        (await currentUserId()),
        weekStart,
        seed,
        "active",
        plan.score,
        JSON.stringify(plan.penalties),
        Math.floor(Date.now() / 1000),
      );

      const slotStmt = trx.prepare(
        "INSERT INTO meal_slots (id, plan_id, date, slot, label, kcal_target, protein_target, max_minutes, portable, locked) VALUES (?,?,?,?,?,?,?,?,?,?)",
      );
      const instStmt = trx.prepare(
        "INSERT INTO recipe_instances (id, recipe_id, user_id, grams, kcal, protein_g, carb_g, fat_g, fiber_g, cost_cents, solver_status, solver_trace, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      );
      const mealStmt = trx.prepare(
        "INSERT INTO meals (id, slot_id, recipe_instance_id, state, explanation, cooked_at) VALUES (?,?,?,?,?,?)",
      );

      const bySlot = new Map(plan.meals.map((m) => [m.slotId, m]));
      for (const slot of ctx.slots) {
        await slotStmt.run(
          slot.id,
          planId,
          slot.date,
          slot.slot,
          slot.label,
          slot.kcalTarget,
          slot.proteinTarget,
          slot.maxMinutes,
          slot.portable ? 1 : 0,
          0,
        );
        const meal = bySlot.get(slot.id);
        if (!meal) continue;
        const instId = randomUUID();
        const solved = exact.get(slot.id);
        const totals = solved?.totals ?? meal.estimate;
        await instStmt.run(
          instId,
          meal.recipeId,
          (await currentUserId()),
          JSON.stringify(solved?.grams ?? {}),
          totals.kcal,
          totals.protein,
          totals.carb,
          totals.fat,
          totals.fiber,
          null,
          solved ? solved.status : "estimated",
          JSON.stringify(meal.breakdown),
          Math.floor(Date.now() / 1000),
        );
        await mealStmt.run(randomUUID(), slot.id, instId, "planned", JSON.stringify(meal.breakdown), null);
      }
    });
  } catch (err) {
    throw err;
  }
  return planId;
}

export interface PlanRow {
  slotId: string;
  date: string;
  slot: SlotKind;
  label: string;
  kcalTarget: number;
  proteinTarget: number;
  maxMinutes: number;
  locked: boolean;
  recipeId: string | null;
  title: string | null;
  cuisine: string | null;
  activeMinutes: number | null;
  image: string | null;
  kcal: number | null;
  protein: number | null;
  state: string | null;
  skipReason: string | null;
  explanation: Record<string, number> | null;
  mealId: string | null;
}

export async function loadPlan(
  weekStart: string,
  lang: "en" | "fr" = "en",
): Promise<{ planId: string; rows: PlanRow[]; } | null> {
  const db = rawDb();
  const plan = await db
    .prepare("SELECT id FROM meal_plans WHERE user_id = ? AND week_start = ?")
    .get((await currentUserId()), weekStart) as { id: string } | undefined;
  if (!plan) return null;

  const rows = await db
    .prepare(
      `SELECT s.id AS slot_id, s.date, s.slot, s.label, s.kcal_target, s.protein_target, s.max_minutes, s.locked,
              m.id AS meal_id, m.state, m.explanation, m.skip_reason,
              r.id AS recipe_id, ${lang === "fr" ? "r.title" : "COALESCE(r.title_en, r.title)"} AS title, r.cuisine, r.active_minutes,
              ri.kcal, ri.protein_g,
              a.path AS image
       FROM meal_slots s
       LEFT JOIN meals m ON m.slot_id = s.id
       LEFT JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       LEFT JOIN recipes r ON r.id = ri.recipe_id
       LEFT JOIN image_assets a ON a.id = r.image_id
       WHERE s.plan_id = ?
       ORDER BY s.date, CASE s.slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 ELSE 3 END`,
    )
    .all(plan.id) as unknown as Record<string, unknown>[];

  return {
    planId: plan.id,
    rows: rows.map((r) => ({
      slotId: String(r["slot_id"]),
      date: String(r["date"]),
      slot: String(r["slot"]) as SlotKind,
      label: String(r["label"]),
      kcalTarget: Number(r["kcal_target"]),
      proteinTarget: Number(r["protein_target"]),
      maxMinutes: Number(r["max_minutes"]),
      locked: Number(r["locked"]) === 1,
      recipeId: r["recipe_id"] ? String(r["recipe_id"]) : null,
      title: r["title"] ? String(r["title"]) : null,
      cuisine: r["cuisine"] ? String(r["cuisine"]) : null,
      activeMinutes: r["active_minutes"] === null ? null : Number(r["active_minutes"]),
      image: r["image"] ? String(r["image"]) : null,
      kcal: r["kcal"] === null ? null : Number(r["kcal"]),
      protein: r["protein_g"] === null ? null : Number(r["protein_g"]),
      state: r["state"] ? String(r["state"]) : null,
      skipReason: r["skip_reason"] ? String(r["skip_reason"]) : null,
      explanation: r["explanation"] ? (JSON.parse(String(r["explanation"])) as Record<string, number>) : null,
      mealId: r["meal_id"] ? String(r["meal_id"]) : null,
    })),
  };
}
