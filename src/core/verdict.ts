export type GoalKind = "bulk" | "bulkFast" | "maintain" | "cut";

export interface DayVerdict {
  tone: "good" | "track" | "short" | "over";
  text: string;
}

export interface VerdictInput {
  target: number;
  eaten: number;
  eatenLow: number;
  eatenHigh: number;
  open: number;
  proteinTarget: number;
  protein: number;
  proteinLow: number;
  openProtein: number;
  goal: GoalKind;
  lang: "en" | "fr";
}

/**
 * La seule question du soir : est-ce que la journée sert l'objectif, même si
 * une partie est estimée ? On raisonne en fourchette : en prise de masse on
 * juge sur le bas de la fourchette (a-t-on mangé AU MOINS assez), en sèche sur
 * le haut (n'a-t-on pas dépassé). Une phrase, jamais un tableau.
 */
export function dayVerdict(i: VerdictInput): DayVerdict {
  const fr = i.lang === "fr";
  const estimated = i.eaten > 0 && i.eatenHigh - i.eatenLow > i.eaten * 0.12;
  const maybe = estimated ? (fr ? "Probablement " : "Probably ") : "";
  const projected = i.eaten + i.open;
  const projectedLow = i.eatenLow + i.open;
  const projectedHigh = i.eatenHigh + i.open;
  const proteinClause =
    i.open === 0 && i.proteinLow < i.proteinTarget * 0.8
      ? fr
        ? ` Protéines basses : ${Math.round(i.protein)} g sur ${Math.round(i.proteinTarget)}.`
        : ` Protein is low: ${Math.round(i.protein)} of ${Math.round(i.proteinTarget)} g.`
      : "";
  const unit = (short: number) =>
    short <= 450 ? (fr ? "une collation" : "a snack") : fr ? "un vrai repas" : "a proper meal";

  if (i.goal === "cut") {
    const over = Math.round(i.eatenHigh - i.target);
    if (i.eatenHigh > i.target + 250) {
      return {
        tone: "over",
        text:
          i.open > 0
            ? fr
              ? `${maybe}déjà au-dessus d'environ ${over} kcal : saute ce qui reste, ou très léger.`
              : `${maybe}already over by about ${over} kcal: skip what is left, or keep it very light.`
            : fr
              ? `${maybe}au-dessus d'environ ${over} kcal aujourd'hui. Demain repart de zéro.`
              : `${maybe}over by about ${over} kcal today. Tomorrow resets.`,
      };
    }
    if (i.open > 0) {
      if (projectedHigh <= i.target + 250 && projectedLow >= i.target - 450) {
        return {
          tone: "track",
          text: fr ? `${maybe}dans les clous de la sèche : ${Math.round(i.open)} kcal encore prévues, taillées pour tenir.` : `${maybe}on plan for the cut: ${Math.round(i.open)} kcal still planned, sized to fit.`,
        };
      }
      if (projected < i.target - 450) {
        return {
          tone: "short",
          text: fr ? `Tu vas finir bas d'environ ${Math.round(i.target - projected)} kcal : une sèche trop dure coûte du muscle.` : `You will land about ${Math.round(i.target - projected)} kcal low: a cut that harsh costs muscle.`,
        };
      }
      if (projected > i.target + 250) {
        const overBy = Math.round(projected - i.target);
        return {
          tone: "over",
          text: fr
            ? `Le prévu te mettrait au-dessus d'environ ${overBy} kcal : allège ce qui reste, ou saute-le.`
            : `What is planned would land about ${overBy} kcal over: go lighter on what is left, or skip it.`,
        };
      }
      return {
        tone: "track",
        text: fr ? `${maybe}proche de la cible une fois le prévu mangé.` : `${maybe}close to target once what is planned is eaten.`,
      };
    }
    if (i.eatenHigh >= i.target - 450) {
      return {
        tone: "good",
        text: (fr ? `${maybe}dans la zone de la sèche, journée bouclée.` : `${maybe}in the zone for the cut, day done.`) + proteinClause,
      };
    }
    return {
      tone: "short",
      text: (fr ? `Journée trop basse d'environ ${Math.round(i.target - i.eaten)} kcal : ${unit(i.target - i.eaten)} garde la sèche saine.` : `About ${Math.round(i.target - i.eaten)} kcal under today: ${unit(i.target - i.eaten)} keeps the cut sane.`) + proteinClause,
    };
  }

  if (i.goal === "maintain") {
    if (i.open === 0) {
      if (Math.abs(i.eaten - i.target) <= 300) {
        return { tone: "good", text: (fr ? `${maybe}autour du maintien, journée bouclée.` : `${maybe}around maintenance, day done.`) + proteinClause };
      }
      return i.eaten > i.target
        ? { tone: "over", text: fr ? `${maybe}au-dessus du maintien d'environ ${Math.round(i.eaten - i.target)} kcal.` : `${maybe}about ${Math.round(i.eaten - i.target)} kcal above maintenance.` }
        : { tone: "short", text: (fr ? `${maybe}sous le maintien d'environ ${Math.round(i.target - i.eaten)} kcal.` : `${maybe}about ${Math.round(i.target - i.eaten)} kcal under maintenance.`) + proteinClause };
    }
    if (Math.abs(projected - i.target) <= 300) {
      return { tone: "track", text: fr ? `${maybe}au maintien une fois le prévu mangé (${Math.round(i.open)} kcal).` : `${maybe}at maintenance once what is planned is eaten (${Math.round(i.open)} kcal).` };
    }
    return projected > i.target
      ? { tone: "over", text: fr ? `Le prévu te mettrait au-dessus d'environ ${Math.round(projected - i.target)} kcal.` : `What is planned would put you about ${Math.round(projected - i.target)} kcal over.` }
      : { tone: "short", text: fr ? `Il manquera environ ${Math.round(i.target - projected)} kcal même avec le prévu : ajoute ${unit(i.target - projected)}.` : `About ${Math.round(i.target - projected)} kcal short even with what is planned: add ${unit(i.target - projected)}.` };
  }

  // Prise de masse : a-t-on mangé AU MOINS assez ? On juge sur le bas de la fourchette.
  if (i.eatenLow >= i.target - 120) {
    return {
      tone: "good",
      text:
        (estimated
          ? fr
            ? "Probablement assez pour la prise de masse, même avec les estimations."
            : "Probably enough for the bulk, even with the estimates."
          : fr
            ? "Assez pour la prise de masse, et c'est compté."
            : "Enough for the bulk, and it is counted.") + proteinClause,
    };
  }
  if (i.open > 0 && projectedLow >= i.target - 120) {
    return {
      tone: "track",
      text: fr ? `${maybe}sur la bonne voie : ${Math.round(i.open)} kcal encore prévues suffisent.` : `${maybe}on track for the bulk: ${Math.round(i.open)} kcal still planned covers it.`,
    };
  }
  const short = Math.round(i.target - projected);
  return {
    tone: "short",
    text:
      (i.open > 0
        ? fr
          ? `Il manquera environ ${short} kcal même avec le prévu : ajoute ${unit(short)}.`
          : `About ${short} kcal short even with what is planned: add ${unit(short)}.`
        : fr
          ? `Environ ${short} kcal sous la cible : ${unit(short)} avant de dormir.`
          : `About ${short} kcal under target: ${unit(short)} before bed.`) + proteinClause,
  };
}
