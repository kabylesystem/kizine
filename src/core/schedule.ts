import type { SlotKind } from "./types";
import type { PlannerSlot } from "./planner-types";

export interface MealSlotSpec {
  slot: SlotKind;
  label: string;
  kcalShare: number;
  proteinShare: number;
  portable: boolean;
  maxMinutes: number;
}

export interface DayProfile {
  weekday: number;
  label: string;
  /** home | school | away | mixed */
  context: string;
  mealSlots: MealSlotSpec[];
}

export interface ScheduleInput {
  weekStart: string;
  dayProfiles: DayProfile[];
  overrides?: Record<string, DayProfile>;
  kcalTarget: number;
  proteinTarget: number;
  /** Tolérance quotidienne autour de la cible, la semaine restant équilibrée. */
  dailyToleranceKcal: number;
  shoppingWeekday: number;
  secondShoppingWeekday?: number | null;
  /** Préfixe des identifiants de créneaux : deux comptes partagent le calendrier. */
  owner?: string;
  /**
   * Jours avec petit-déjeuner. default-user n'a pas faim le matin : au-delà de
   * ce compte, la journée n'a que deux ou trois repas et les calories du matin
   * se reportent sur les autres, puisque les parts sont normalisées.
   */
  breakfastDays?: number;
  /** Idem pour la collation : default-user n'est « pas très snack ». */
  snackDays?: number;
  /** Jours où il a explicitement retiré la collation, quel que soit le réglage. */
  noSnackDates?: Set<string>;
  /**
   * Répartition choisie des calories entre les repas (fractions, somme 1).
   * Elle remplace les parts par défaut de chaque jour ; un repas retiré ce
   * jour-là reverse toujours sa part aux repas principaux.
   */
  kcalSplit?: KcalSplit | null;
}

export type KcalSplit = Record<SlotKind, number>;

export const SPLIT_SLOTS: SlotKind[] = ["breakfast", "lunch", "snack", "dinner"];

export const DEFAULT_SPLIT: KcalSplit = { breakfast: 0.16, lunch: 0.32, snack: 0.14, dinner: 0.38 };

/** Ramène quatre nombres positifs à des fractions qui font 1. */
export function normalizeSplit(raw: Partial<Record<string, number>> | null | undefined): KcalSplit | null {
  if (!raw) return null;
  const clean = Object.fromEntries(
    SPLIT_SLOTS.map((s) => [s, Math.max(0, Number(raw[s] ?? 0)) || 0]),
  ) as KcalSplit;
  const total = SPLIT_SLOTS.reduce((sum, s) => sum + clean[s], 0);
  if (total <= 0) return null;
  for (const s of SPLIT_SLOTS) clean[s] = clean[s] / total;
  return clean;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** Jours écoulés depuis la dernière session de courses, à cette date. */
export function daysSinceShopping(
  dayIndex: number,
  weekStartWeekday: number,
  shoppingWeekday: number,
  secondShoppingWeekday?: number | null,
): number {
  const shoppingDays: number[] = [];
  for (let i = -7; i < 14; i++) {
    const wd = (weekStartWeekday + i + 70) % 7;
    if (wd === shoppingWeekday || (secondShoppingWeekday != null && wd === secondShoppingWeekday)) {
      shoppingDays.push(i);
    }
  }
  const past = shoppingDays.filter((d) => d <= dayIndex);
  if (past.length === 0) return 7;
  return dayIndex - Math.max(...past);
}

export function buildSlots(input: ScheduleInput): PlannerSlot[] {
  const slots: PlannerSlot[] = [];
  const startWeekday = weekdayOf(input.weekStart);
  const roll = (value: number | undefined, salt: number): number => {
    if (value === undefined) return 7;
    if (value >= 0) return value;
    // « Au hasard » : entre deux et cinq jours, tiré de la semaine et de la graine.
    const basis = [...input.weekStart].reduce((a, c) => a + c.charCodeAt(0), salt);
    return 2 + (basis % 4);
  };
  const breakfastDays = roll(input.breakfastDays, 11);
  const snackDays = roll(input.snackDays, 37);

  // Les petits-déjeuners gardés vont là où on a le temps : d'abord les jours
  // à la maison, puis le week-end. Un matin d'école, il ne déjeune pas.
  const homeFirst = Array.from({ length: 7 }, (_, i) => i).sort((a, b) => {
    const wa = (startWeekday + a) % 7;
    const wb = (startWeekday + b) % 7;
    const pa = input.dayProfiles.find((p) => p.weekday === wa);
    const pb = input.dayProfiles.find((p) => p.weekday === wb);
    const rank = (c?: string) => (c === "home" ? 0 : c === "flexible" ? 1 : 2);
    const weekend = (w: number) => (w === 0 || w === 6 ? 0 : 1);
    return rank(pa?.context) - rank(pb?.context) || weekend(wa) - weekend(wb) || a - b;
  });
  const withBreakfast = new Set(homeFirst.slice(0, Math.max(0, Math.min(7, breakfastDays))));
  // Les collations gardées vont aux jours les plus chargés, pas aux jours calmes :
  // c'est là qu'un vrai repas ne rentre pas.
  const busyFirst = [...homeFirst].reverse();
  const withSnack = new Set(busyFirst.slice(0, Math.max(0, Math.min(7, snackDays))));

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const date = addDays(input.weekStart, dayIndex);
    const weekday = (startWeekday + dayIndex) % 7;
    const profile =
      input.overrides?.[date] ??
      input.dayProfiles.find((p) => p.weekday === weekday) ??
      input.dayProfiles[0];
    if (!profile) continue;

    const keepsBreakfast = withBreakfast.has(dayIndex);
    const keepsSnack = withSnack.has(dayIndex) && !input.noSnackDates?.has(date);
    const base = input.kcalSplit
      ? profile.mealSlots.map((m) => ({
          ...m,
          kcalShare: input.kcalSplit![m.slot] ?? m.kcalShare,
          proteinShare: input.kcalSplit![m.slot] ?? m.proteinShare,
        }))
      : profile.mealSlots;
    const removed = base.filter(
      (m) => (m.slot === "breakfast" && !keepsBreakfast) || (m.slot === "snack" && !keepsSnack),
    );
    const kept = base.filter(
      (m) => (m.slot !== "breakfast" || keepsBreakfast) && (m.slot !== "snack" || keepsSnack),
    );

    // Sauter le petit-déjeuner ne doit pas gonfler la collation : ses calories
    // vont aux repas principaux. Une collation à 560 kcal n'est plus une collation.
    const mains = kept.filter((m) => m.slot === "lunch" || m.slot === "dinner");
    const freedKcal = removed.reduce((sum, m) => sum + m.kcalShare, 0);
    const freedProtein = removed.reduce((sum, m) => sum + m.proteinShare, 0);
    const specs =
      freedKcal > 0 && mains.length > 0
        ? kept.map((m) =>
            m.slot === "lunch" || m.slot === "dinner"
              ? {
                  ...m,
                  kcalShare: m.kcalShare + freedKcal / mains.length,
                  proteinShare: m.proteinShare + freedProtein / mains.length,
                }
              : m,
          )
        : kept;

    const kcalShareTotal = specs.reduce((s, m) => s + m.kcalShare, 0) || 1;
    const proteinShareTotal = specs.reduce((s, m) => s + m.proteinShare, 0) || 1;

    for (const spec of specs) {
      slots.push({
        id: input.owner ? `${input.owner}:${date}:${spec.slot}` : `${date}:${spec.slot}`,
        date,
        dayIndex,
        slot: spec.slot,
        label: spec.label,
        kcalTarget: Math.round((input.kcalTarget * spec.kcalShare) / kcalShareTotal),
        proteinTarget: Math.round((input.proteinTarget * spec.proteinShare) / proteinShareTotal),
        maxMinutes: spec.maxMinutes,
        portable: spec.portable,
        locked: false,
      });
    }
  }
  return slots;
}

/**
 * Rythme par défaut de default-user : peu d'appétit le matin, deux gros repas
 * et une collation dense. Les jours d'école, le midi doit se transporter.
 * Ce n'est qu'un point de départ : l'onboarding le réécrit.
 */
/**
 * Le temps affiché est un budget de PRÉPARATION, pas le temps disponible sur place.
 * Un repas transportable se cuisine la veille à la maison : lui donner zéro minute
 * rendait tout plat impossible, ce qui bloquait les jours d'école.
 */
export function defaultDayProfiles(): DayProfile[] {
  const homeDay = (weekday: number, label: string): DayProfile => ({
    weekday,
    label,
    context: "home",
    mealSlots: [
      { slot: "breakfast", label: "Morning fuel", kcalShare: 0.16, proteinShare: 0.18, portable: false, maxMinutes: 8 },
      { slot: "lunch", label: "Lunch", kcalShare: 0.32, proteinShare: 0.32, portable: false, maxMinutes: 30 },
      { slot: "snack", label: "Afternoon", kcalShare: 0.14, proteinShare: 0.12, portable: true, maxMinutes: 15 },
      { slot: "dinner", label: "Dinner", kcalShare: 0.38, proteinShare: 0.38, portable: false, maxMinutes: 45 },
    ],
  });
  const schoolDay = (weekday: number, label: string): DayProfile => ({
    weekday,
    label,
    context: "school",
    mealSlots: [
      { slot: "breakfast", label: "Morning fuel", kcalShare: 0.14, proteinShare: 0.16, portable: true, maxMinutes: 15 },
      { slot: "lunch", label: "Packed lunch", kcalShare: 0.33, proteinShare: 0.32, portable: true, maxMinutes: 40 },
      { slot: "snack", label: "Between classes", kcalShare: 0.15, proteinShare: 0.14, portable: true, maxMinutes: 15 },
      { slot: "dinner", label: "Dinner", kcalShare: 0.38, proteinShare: 0.38, portable: false, maxMinutes: 40 },
    ],
  });
  return [
    homeDay(0, "Sunday"),
    schoolDay(1, "Monday"),
    schoolDay(2, "Tuesday"),
    schoolDay(3, "Wednesday"),
    schoolDay(4, "Thursday"),
    schoolDay(5, "Friday"),
    homeDay(6, "Saturday"),
  ];
}

/** Variante deux repas : pas de petit-déjeuner, tout se joue midi et soir. */
export function twoMealDay(weekday: number, label: string, context: string): DayProfile {
  return {
    weekday,
    label,
    context,
    mealSlots: [
      { slot: "lunch", label: "First meal", kcalShare: 0.42, proteinShare: 0.42, portable: context !== "home", maxMinutes: context === "home" ? 30 : 40 },
      { slot: "snack", label: "Loader", kcalShare: 0.16, proteinShare: 0.14, portable: true, maxMinutes: 15 },
      { slot: "dinner", label: "Dinner", kcalShare: 0.42, proteinShare: 0.44, portable: false, maxMinutes: 45 },
    ],
  };
}
