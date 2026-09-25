/**
 * Dépense d'entraînement, calculée et pas devinée.
 *
 * Base : Compendium of Physical Activities (Ainsworth et al.), qui attribue à
 * chaque activité un MET. La dépense brute vaut MET x 3,5 x kg / 200 kcal par
 * minute. On retire le métabolisme de repos (MET - 1) : ces calories-là sont
 * déjà comptées dans le métabolisme de base, les additionner serait du double
 * comptage, et c'est l'erreur classique des calculateurs en ligne.
 *
 * Deuxième correction, celle qui manque partout ailleurs : une séance n'est PAS
 * homogène. Un entraînement de MMA, c'est un échauffement, du drill technique
 * et du sparring, trois intensités très différentes. On décompose donc chaque
 * sport en blocs, chacun avec son propre MET et sa propre durée réglable.
 */
export interface Block {
  id: string;
  label: string;
  labelFr: string;
  met: number;
  minutes: number;
}

export interface Sport {
  id: string;
  label: string;
  labelFr: string;
  note: string;
  noteFr: string;
  blocks: Block[];
}

const b = (id: string, label: string, labelFr: string, met: number, minutes: number): Block => ({
  id,
  label,
  labelFr,
  met,
  minutes,
});

export const SPORTS: Sport[] = [
  {
    id: "mma",
    label: "MMA",
    labelFr: "MMA",
    note: "warm-up, drilling, sparring: three different intensities",
    noteFr: "échauffement, drill, sparring : trois intensités différentes",
    blocks: [
      b("warmup", "warm-up and mobility", "échauffement et mobilité", 5.0, 18),
      b("drill", "technique drilling", "drill technique", 6.0, 40),
      b("spar", "sparring", "sparring", 10.3, 32),
    ],
  },
  {
    id: "grappling",
    label: "Grappling / wrestling",
    labelFr: "Grappling / lutte",
    note: "mostly positional work, hard rounds at the end",
    noteFr: "surtout du placement, des rounds durs à la fin",
    blocks: [
      b("warmup", "warm-up", "échauffement", 5.0, 15),
      b("drill", "drilling", "drill", 6.0, 40),
      b("roll", "live rolling", "rounds réels", 10.0, 25),
    ],
  },
  {
    id: "kickboxing",
    label: "Kickboxing / boxing",
    labelFr: "Kickboxing / boxe",
    note: "pads and bag carry more cardio than grappling drills",
    noteFr: "pattes d'ours et sac : plus cardio que le drill au sol",
    blocks: [
      b("warmup", "rope and shadow", "corde et shadow", 6.0, 15),
      b("pads", "pads and bag", "pattes et sac", 7.8, 35),
      b("spar", "sparring", "sparring", 10.3, 20),
    ],
  },
  {
    id: "lifting",
    label: "Weights",
    labelFr: "Musculation",
    note: "the rests are most of the session, and they are not free",
    noteFr: "les temps de repos font l'essentiel de la séance, et ils comptent",
    blocks: [
      b("warmup", "warm-up sets", "séries d'échauffement", 3.5, 12),
      b("work", "working sets", "séries lourdes", 6.0, 45),
      b("rest", "rest between sets", "repos entre séries", 1.8, 20),
    ],
  },
  {
    id: "powerlifting",
    label: "Powerlifting",
    labelFr: "Powerlifting",
    note: "heavy singles, and three to five minutes of rest between them",
    noteFr: "séries lourdes, et trois à cinq minutes de repos entre chaque",
    blocks: [
      b("warmup", "warm-up ramp", "montée en charge", 4.0, 20),
      b("work", "heavy sets", "séries lourdes", 6.0, 22),
      b("rest", "rest between sets", "repos entre séries", 1.5, 38),
    ],
  },
  {
    id: "calisthenics",
    label: "Calisthenics",
    labelFr: "Callisthénie",
    note: "pull-ups, dips, bodyweight circuits",
    noteFr: "tractions, dips, circuits au poids du corps",
    blocks: [
      b("warmup", "warm-up", "échauffement", 4.0, 10),
      b("work", "sets", "séries", 8.0, 35),
    ],
  },
  {
    id: "hiit",
    label: "HIIT / circuit",
    labelFr: "HIIT / circuit",
    note: "intervals, short rests",
    noteFr: "intervalles, repos courts",
    blocks: [
      b("warmup", "warm-up", "échauffement", 4.0, 8),
      b("work", "intervals", "intervalles", 9.0, 22),
    ],
  },
  {
    id: "running",
    label: "Running",
    labelFr: "Course à pied",
    note: "around 10 km/h",
    noteFr: "autour de 10 km/h",
    blocks: [b("run", "steady run", "course régulière", 9.8, 40)],
  },
  {
    id: "cycling",
    label: "Cycling",
    labelFr: "Vélo",
    note: "19 to 22 km/h",
    noteFr: "19 à 22 km/h",
    blocks: [b("ride", "ride", "sortie", 8.0, 50)],
  },
  {
    id: "swimming",
    label: "Swimming",
    labelFr: "Natation",
    note: "freestyle, steady laps",
    noteFr: "crawl, longueurs régulières",
    blocks: [b("swim", "laps", "longueurs", 8.3, 45)],
  },
  {
    id: "football",
    label: "Football",
    labelFr: "Football",
    note: "casual game",
    noteFr: "match entre potes",
    blocks: [b("play", "game", "match", 7.0, 90)],
  },
  {
    id: "basketball",
    label: "Basketball",
    labelFr: "Basket",
    note: "full game",
    noteFr: "match complet",
    blocks: [b("play", "game", "match", 8.0, 60)],
  },
  {
    id: "climbing",
    label: "Climbing",
    labelFr: "Escalade",
    note: "bouldering or rope, long rests between attempts",
    noteFr: "bloc ou voie, longs repos entre essais",
    blocks: [
      b("climb", "climbing", "grimpe", 8.0, 45),
      b("rest", "rest between attempts", "repos entre essais", 1.8, 45),
    ],
  },
  {
    id: "yoga",
    label: "Yoga",
    labelFr: "Yoga",
    note: "hatha, steady",
    noteFr: "hatha, régulier",
    blocks: [b("flow", "practice", "pratique", 3.0, 60)],
  },
  {
    id: "walking",
    label: "Walking",
    labelFr: "Marche",
    note: "around 5 km/h",
    noteFr: "autour de 5 km/h",
    blocks: [b("walk", "walk", "marche", 3.5, 60)],
  },
];

export const sportById = (id: string): Sport | undefined => SPORTS.find((s) => s.id === id);

/** Une séance enregistrée : le sport, la fréquence, et les durées de ses blocs. */
export interface TrainingSession {
  sportId: string;
  perWeek: number;
  /** Minutes par bloc, clés = Block.id. Absent = valeur par défaut du sport. */
  blockMinutes?: Record<string, number>;
  /** Ancienne forme, gardée pour les données déjà écrites. */
  minutes?: number;
}

/** kcal nettes d'un bloc : le repos est déjà compté dans le métabolisme de base. */
export const blockKcal = (met: number, minutes: number, weightKg: number): number =>
  ((met - 1) * 3.5 * weightKg / 200) * minutes;

export function sessionMinutes(sport: Sport, s: TrainingSession): Record<string, number> {
  const out: Record<string, number> = {};
  for (const blk of sport.blocks) out[blk.id] = s.blockMinutes?.[blk.id] ?? blk.minutes;
  return out;
}

export function sessionKcal(sport: Sport, s: TrainingSession, weightKg: number): number {
  const mins = sessionMinutes(sport, s);
  return Math.round(
    sport.blocks.reduce((sum, blk) => sum + blockKcal(blk.met, mins[blk.id] ?? 0, weightKg), 0),
  );
}

export function sessionTotalMinutes(sport: Sport, s: TrainingSession): number {
  const mins = sessionMinutes(sport, s);
  return sport.blocks.reduce((sum, blk) => sum + (mins[blk.id] ?? 0), 0);
}

export function weeklyTrainingKcal(sessions: TrainingSession[], weightKg: number): number {
  return sessions.reduce((sum, s) => {
    const sport = sportById(s.sportId);
    if (!sport) return sum;
    return sum + sessionKcal(sport, s, weightKg) * s.perWeek;
  }, 0);
}

export interface Projection {
  day: number;
  date: string;
  kg: number;
}

export function project(
  fromKg: number,
  kgPerWeek: number,
  days: number,
  startDate = new Date(),
  step = 5,
): Projection[] {
  const out: Projection[] = [];
  for (let d = 0; d <= days; d += step) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    out.push({
      day: d,
      date: date.toISOString().slice(0, 10),
      kg: Math.round((fromKg + (kgPerWeek * d) / 7) * 100) / 100,
    });
  }
  return out;
}

export interface HorizonVerdict {
  days: number;
  targetKg: number;
  atTargetPace: number;
  atObservedPace: number | null;
  gapKg: number | null;
  message: string;
}

export function horizon(
  currentKg: number,
  targetKg: number,
  targetKgPerWeek: number,
  observedKgPerWeek: number | null,
  days: number,
): HorizonVerdict {
  const atTargetPace = Math.round((currentKg + (targetKgPerWeek * days) / 7) * 10) / 10;
  const atObservedPace =
    observedKgPerWeek === null ? null : Math.round((currentKg + (observedKgPerWeek * days) / 7) * 10) / 10;
  const gapKg = atObservedPace === null ? null : Math.round((atObservedPace - targetKg) * 10) / 10;

  const losing = targetKg < currentKg;
  let message: string;
  if (atObservedPace === null) {
    message = `On the planned pace you land at ${atTargetPace} kg in ${days} days. Weigh in for two weeks and this line becomes real.`;
  } else if (Math.abs(gapKg ?? 0) <= 0.7) {
    message = `At the pace the scale is actually showing, you land at ${atObservedPace} kg in ${days} days. That is the goal.`;
  } else if ((gapKg ?? 0) < 0) {
    message = `At the pace the scale is actually showing, you land at ${atObservedPace} kg in ${days} days, ${Math.abs(gapKg ?? 0)} kg ${losing ? "past the goal" : "short"}.`;
  } else {
    message = `At the pace the scale is actually showing, you land at ${atObservedPace} kg in ${days} days, ${gapKg} kg ${losing ? "short" : "above the goal"}.`;
  }
  return { days, targetKg, atTargetPace, atObservedPace, gapKg, message };
}
