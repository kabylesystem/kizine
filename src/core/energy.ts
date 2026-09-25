/**
 * Cible énergétique et protéique, dérivée du corps et de l'objectif.
 * Rien n'est imposé : ces valeurs sont des propositions affichées, ajustables.
 */
export interface BodyInput {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: "m" | "f";
  /** 1.2 sédentaire, 1.55 modéré, 1.725 intense, 1.9 très intense. */
  activityFactor: number;
}

/** Mifflin-St Jeor : la formule la mieux validée pour le métabolisme de repos. */
export function restingEnergy(b: BodyInput): number {
  const base = 10 * b.weightKg + 6.25 * b.heightCm - 5 * b.ageYears;
  return b.sex === "m" ? base + 5 : base - 161;
}

export function maintenanceEnergy(b: BodyInput): number {
  return restingEnergy(b) * b.activityFactor;
}

/**
 * Surplus nécessaire pour un gain visé.
 * ~7 700 kcal par kilo de tissu, mais une prise rapide comporte du gras :
 * on utilise 6 500 kcal/kg, valeur haute observée en prise de masse rapide.
 */
export const KCAL_PER_KG = 6500;

export function surplusFor(gainKgPerWeek: number): number {
  return (gainKgPerWeek * KCAL_PER_KG) / 7;
}

export function suggestedTarget(b: BodyInput, gainKgPerWeek: number): number {
  return Math.round((maintenanceEnergy(b) + surplusFor(gainKgPerWeek)) / 10) * 10;
}

export function proteinTarget(weightKg: number, perKg = 2.1): number {
  return Math.round(weightKg * perKg);
}

/** Répartition minimale des lipides, pour ne pas construire un régime absurde. */
export function fatFloor(kcalTarget: number): number {
  return Math.round((kcalTarget * 0.22) / 9);
}

export interface WeightPoint {
  date: string;
  kg: number;
}

/** Moyenne glissante : on ne réagit jamais à une pesée isolée. */
export function rollingAverage(points: WeightPoint[], windowDays = 7): WeightPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p, i) => {
    const start = Math.max(0, i - windowDays + 1);
    const slice = sorted.slice(start, i + 1);
    const avg = slice.reduce((s, x) => s + x.kg, 0) / slice.length;
    return { date: p.date, kg: Math.round(avg * 100) / 100 };
  });
}

export interface TrendVerdict {
  observedKgPerWeek: number | null;
  targetKgPerWeek: number;
  verdict: "on_track" | "too_slow" | "too_fast" | "not_enough_data";
  suggestedKcalDelta: number;
  message: string;
}

/**
 * Compare la pente réelle à la pente visée sur au moins 14 jours.
 * Ne change jamais la cible tout seul : renvoie une proposition.
 */
export function trend(points: WeightPoint[], targetKgPerWeek: number): TrendVerdict {
  const avg = rollingAverage(points);
  if (avg.length < 14) {
    return {
      observedKgPerWeek: null,
      targetKgPerWeek,
      verdict: "not_enough_data",
      suggestedKcalDelta: 0,
      message: "14 weigh-ins needed before anything can be concluded",
    };
  }
  const first = avg[0]!;
  const last = avg[avg.length - 1]!;
  const days = (Date.parse(last.date) - Date.parse(first.date)) / 86400000;
  if (days < 13) {
    return {
      observedKgPerWeek: null,
      targetKgPerWeek,
      verdict: "not_enough_data",
      suggestedKcalDelta: 0,
      message: "too short a window for a reliable trend",
    };
  }
  const observed = ((last.kg - first.kg) / days) * 7;
  const diff = observed - targetKgPerWeek;
  const tolerance = Math.max(0.12, targetKgPerWeek * 0.25);

  if (Math.abs(diff) <= tolerance) {
    return {
      observedKgPerWeek: observed,
      targetKgPerWeek,
      verdict: "on_track",
      suggestedKcalDelta: 0,
      message: `${observed.toFixed(2)} kg per week, on target`,
    };
  }
  const delta = Math.round((-diff * KCAL_PER_KG) / 7 / 25) * 25;
  const capped = Math.max(-300, Math.min(300, delta));
  return {
    observedKgPerWeek: observed,
    targetKgPerWeek,
    verdict: diff < 0 ? "too_slow" : "too_fast",
    suggestedKcalDelta: capped,
    message:
      diff < 0
        ? `${observed.toFixed(2)} kg per week instead of ${targetKgPerWeek.toFixed(2)}: suggest +${capped} kcal per day`
        : `${observed.toFixed(2)} kg per week instead of ${targetKgPerWeek.toFixed(2)}: suggest ${capped} kcal per day`,
  };
}
