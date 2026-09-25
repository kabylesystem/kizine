import { normalize, hasTerm, type CiqualDb, type CiqualFood } from "./ciqual";

const PENALTY_WORDS = [
  "sandwich", "pizza", "preemballe", "prepare", "plat", "quiche", "tarte", "gratin",
  "beignet", "panee", "farci", "salade composee", "soupe", "veloute", "sauce ", "conserve appertisee",
  "aliment moyen", "prelevee", "prelevé", "martinique", "guadeloupe", "reunion", "guyane",
  "bio", "allege", "sirop", "confit", "jus de", "nectar", "compote", "boisson", "puree", "chips",
  "biscuit", "gateau", "cuisine", "cuisinee", "vente a emporter", "restauration", "instantane",
];

const BONUS_WORDS = ["cru", "crue", "crues", "sec", "seche", "nature"];

export interface Resolution {
  code: string | null;
  name: string;
  score: number;
  alternatives: { code: string; name: string; score: number }[];
}

export function resolveFood(dbx: CiqualDb, query: number | string): Resolution {
  if (typeof query === "number") {
    const f = dbx.foods.get(String(query));
    return { code: f ? f.code : null, name: f?.nameFr ?? "INTROUVABLE", score: 100, alternatives: [] };
  }
  const terms = query.split("+").map(normalize).filter(Boolean);
  const hits: { food: CiqualFood; score: number }[] = [];
  for (const food of dbx.foods.values()) {
    const hay = normalize(food.nameFr);
    if (!terms.every((t) => hasTerm(hay, t))) continue;
    let score = 60;
    score -= Math.min(30, hay.length / 4);
    for (const w of PENALTY_WORDS) if (hay.includes(w)) score -= 14;
    for (const w of BONUS_WORDS) if (hay.split(/[\s,]+/).includes(w)) score += 6;
    if (hay.startsWith(terms[0] ?? "")) score += 8;
    hits.push({ food, score });
  }
  hits.sort((a, b) => b.score - a.score);
  const best = hits[0];
  return {
    code: best ? best.food.code : null,
    name: best ? best.food.nameFr : "INTROUVABLE",
    score: best ? best.score : 0,
    alternatives: hits.slice(1, 4).map((h) => ({ code: h.food.code, name: h.food.nameFr, score: h.score })),
  };
}
