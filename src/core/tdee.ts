import { weeklyTrainingKcal, type TrainingSession } from "./training";

/**
 * Calculateur de dépense énergétique, décomposé au lieu d'être multiplié.
 *
 * Les calculateurs grand public font BMR x un facteur unique choisi dans une
 * liste de cinq lignes. Ça écrase toute la réalité : cinq séances de yoga et
 * cinq séances de MMA tombent dans la même case. Ici chaque poste est calculé
 * séparément, avec sa source, et la somme est vérifiable :
 *
 *   TDEE = métabolisme de repos + thermogenèse alimentaire + vie quotidienne
 *          + trajets + entraînements
 */

export type Sex = "m" | "f";

export interface Body {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
  /** Masse grasse en pourcentage, si connue. Change la formule utilisée. */
  bodyFatPct?: number | null;
}

/** Mifflin-St Jeor : la formule la mieux validée quand on ignore la composition. */
export function mifflin(b: Body): number {
  const base = 10 * b.weightKg + 6.25 * b.heightCm - 5 * b.ageYears;
  return b.sex === "m" ? base + 5 : base - 161;
}

/** Katch-McArdle : plus juste dès qu'on connaît la masse maigre, donc chez un sportif. */
export function katchMcArdle(b: Body): number | null {
  if (b.bodyFatPct === undefined || b.bodyFatPct === null) return null;
  const lean = b.weightKg * (1 - b.bodyFatPct / 100);
  return 370 + 21.6 * lean;
}

export function restingEnergy(b: Body): { kcal: number; formula: "katch-mcardle" | "mifflin-st-jeor" } {
  const katch = katchMcArdle(b);
  return katch !== null
    ? { kcal: katch, formula: "katch-mcardle" }
    : { kcal: mifflin(b), formula: "mifflin-st-jeor" };
}

/**
 * Thermogenèse alimentaire : digérer coûte, et pas pareil selon le macro.
 * Protéines 25 %, glucides 8 %, lipides 2 %. La plupart des outils mettent 10 %
 * forfaitaires ; à 200 g de protéines par jour l'écart dépasse 100 kcal.
 */
export function thermicEffect(macros: { proteinG: number; carbG: number; fatG: number }): number {
  return 0.25 * (macros.proteinG * 4) + 0.08 * (macros.carbG * 4) + 0.02 * (macros.fatG * 9);
}

/**
 * Vie quotidienne hors sport et hors trajets : posture, ménage, agitation.
 * Volontairement bas, parce que trajets et séances sont comptés à part.
 */
export const DAILY_LIFE = {
  seated: { factor: 0.15, label: "mostly seated", labelFr: "surtout assis" },
  mixed: { factor: 0.25, label: "up and down all day", labelFr: "debout par moments" },
  onFeet: { factor: 0.4, label: "on my feet", labelFr: "debout toute la journée" },
  physical: { factor: 0.6, label: "physical job", labelFr: "métier physique" },
} as const;

export type DailyLife = keyof typeof DAILY_LIFE;

export const COMMUTE_MODES = {
  walk: { met: 3.5, kmh: 5, label: "on foot", labelFr: "à pied" },
  bike: { met: 6.8, kmh: 15, label: "by bike", labelFr: "à vélo" },
  // Le Compendium ne cote pas les vélos électriques. Les mesures publiées
  // s'étalent de 3,1 à 5,7 MET selon le niveau d'assistance (Langford 2017).
  // Avec une assistance forte, le pédalage devient symbolique : on retient le
  // bas de la fourchette, plus proche du ressenti qu'une moyenne flatteuse.
  ebike: { met: 3.4, kmh: 20, label: "electric bike", labelFr: "vélo électrique" },
  transit: { met: 2.0, kmh: 20, label: "public transport", labelFr: "transports" },
  scooter: { met: 2.5, kmh: 20, label: "scooter", labelFr: "trottinette" },
  car: { met: 1.3, kmh: 25, label: "by car", labelFr: "en voiture" },
} as const;

export type CommuteMode = keyof typeof COMMUTE_MODES;

export interface Commute {
  mode: CommuteMode;
  /** Distance d'un aller, en kilomètres. */
  km: number;
  /** Trajets aller-retour par semaine. */
  tripsPerWeek: number;
  /** Durée d'un aller en minutes, si tu la connais mieux que la carte. */
  minutesOneWay?: number | null;
}

/**
 * Un trajet compte deux fois (aller et retour) et sa durée vient de la vitesse
 * du mode, pas d'un temps saisi au doigt mouillé.
 */
export function commuteKcalPerWeek(commutes: Commute[], weightKg: number): number {
  return commutes.reduce((sum, c) => {
    const mode = COMMUTE_MODES[c.mode];
    if (!mode || c.km <= 0 || c.tripsPerWeek <= 0) return sum;
    // Sa mesure prime sur l'estimation : il connaît son trajet mieux que la carte.
    const minutesOneWay = c.minutesOneWay && c.minutesOneWay > 0 ? c.minutesOneWay : (c.km / mode.kmh) * 60;
    const perTrip = ((mode.met - 1) * 3.5 * weightKg / 200) * minutesOneWay * 2;
    return sum + perTrip * c.tripsPerWeek;
  }, 0);
}

export interface Breakdown {
  resting: number;
  formula: "katch-mcardle" | "mifflin-st-jeor";
  thermic: number;
  dailyLife: number;
  commute: number;
  training: number;
  total: number;
}

export function tdee(input: {
  body: Body;
  dailyLife: DailyLife;
  commutes: Commute[];
  sessions: TrainingSession[];
  /** Macros visées, pour la thermogenèse. Absentes = estimation à 15 % de protéines. */
  macros?: { proteinG: number; carbG: number; fatG: number };
  kcalGuess?: number;
}): Breakdown {
  const { kcal: resting, formula } = restingEnergy(input.body);
  const life = resting * DAILY_LIFE[input.dailyLife].factor;
  const commute = commuteKcalPerWeek(input.commutes, input.body.weightKg) / 7;
  const training = weeklyTrainingKcal(input.sessions, input.body.weightKg) / 7;

  const beforeFood = resting + life + commute + training;
  const macros =
    input.macros ??
    (() => {
      // Sans plan sous la main, on part d'une répartition plausible pour estimer
      // la digestion, et on le dit : c'est le seul poste approximé.
      const kcal = input.kcalGuess ?? beforeFood * 1.1;
      return { proteinG: (kcal * 0.25) / 4, carbG: (kcal * 0.45) / 4, fatG: (kcal * 0.3) / 9 };
    })();
  const thermic = thermicEffect(macros);

  return {
    resting: Math.round(resting),
    formula,
    thermic: Math.round(thermic),
    dailyLife: Math.round(life),
    commute: Math.round(commute),
    training: Math.round(training),
    total: Math.round(beforeFood + thermic),
  };
}

export const GOALS = {
  bulk: { label: "build muscle", labelFr: "prendre du muscle", kgPerWeek: 0.35 },
  bulkFast: { label: "gain weight fast", labelFr: "prendre du poids vite", kgPerWeek: 0.8 },
  maintain: { label: "hold steady", labelFr: "me maintenir", kgPerWeek: 0 },
  cut: { label: "lose fat", labelFr: "perdre du gras", kgPerWeek: -0.5 },
} as const;

export type GoalKind = keyof typeof GOALS;

/**
 * 7 700 kcal par kilo de tissu pur. En prise rapide une part est du gras, donc
 * le rendement réel est meilleur que la théorie : on retient 6 500 kcal/kg,
 * valeur haute observée en prise de masse. En perte on garde 7 700, parce que
 * là on déstocke bien du gras.
 */
export const KCAL_PER_KG_GAIN = 6500;
export const KCAL_PER_KG_LOSS = 7700;

export interface Plan {
  maintenanceKcal: number;
  targetKcal: number;
  deltaKcal: number;
  kgPerWeek: number;
  weeksToGoal: number | null;
  /** Part de muscle attendue dans la prise, d'après la vitesse choisie. */
  leanShare: number;
  warning: string | null;
}

/**
 * Au-delà d'environ 0,5 % du poids de corps par semaine, la prise devient
 * majoritairement grasse chez un débutant, et presque entièrement grasse
 * au-delà de 1 %. On le dit au lieu de vendre un chiffre flatteur.
 */
export function planFor(
  maintenance: number,
  weightKg: number,
  kgPerWeek: number,
  targetKg: number | null,
  lang: "en" | "fr" = "en",
): Plan {
  const perKgRate = weightKg > 0 ? (Math.abs(kgPerWeek) / weightKg) * 100 : 0;
  const rateKcal = kgPerWeek >= 0 ? KCAL_PER_KG_GAIN : KCAL_PER_KG_LOSS;
  const delta = Math.round((kgPerWeek * rateKcal) / 7);
  const target = Math.round((maintenance + delta) / 10) * 10;

  const weeks =
    targetKg === null || kgPerWeek === 0 ? null : Math.ceil(Math.abs(targetKg - weightKg) / Math.abs(kgPerWeek));

  const leanShare =
    kgPerWeek <= 0 ? 1 : perKgRate <= 0.35 ? 0.65 : perKgRate <= 0.6 ? 0.45 : perKgRate <= 1 ? 0.3 : 0.2;

  let warning: string | null = null;
  if (kgPerWeek > 0 && perKgRate > 0.6) {
    warning =
      lang === "fr"
        ? `À ${kgPerWeek.toFixed(2)} kg par semaine, environ ${Math.round((1 - leanShare) * 100)} % de la prise sera du gras. C'est ton choix, mais il est chiffré.`
        : `At ${kgPerWeek.toFixed(2)} kg a week, roughly ${Math.round((1 - leanShare) * 100)} % of the gain will be fat. Your call, but now it is a number.`;
  }
  if (kgPerWeek < 0 && perKgRate > 1) {
    warning =
      lang === "fr"
        ? "Au-delà de 1 % du poids par semaine en perte, tu perds du muscle avec le gras."
        : "Losing more than 1 % of body weight a week costs muscle, not just fat.";
  }

  return {
    maintenanceKcal: Math.round(maintenance),
    targetKcal: target,
    deltaKcal: delta,
    kgPerWeek,
    weeksToGoal: weeks,
    leanShare,
    warning,
  };
}

export function proteinTarget(weightKg: number, goal: GoalKind): number {
  // 1,6 g/kg suffit à maintenir, 2,2 g/kg couvre la construction, plus haut en déficit.
  const perKg = goal === "cut" ? 2.4 : goal === "maintain" ? 1.8 : 2.2;
  return Math.round(weightKg * perKg);
}

export function fatFloor(kcalTarget: number): number {
  return Math.round((kcalTarget * 0.22) / 9);
}
