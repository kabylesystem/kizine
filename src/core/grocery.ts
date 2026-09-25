import type { ConceptMeta, PantryLot, PlannedMeal, PlannerRecipe, PlannerSlot } from "./planner-types";
import { planPurchase, type PurchasePlan } from "./packaging";
import { shoppingHint } from "./household";

export interface GroceryLine extends PurchasePlan {
  staple: boolean;
  /** Prix du paquet entier, à afficher quand il faut vraiment le racheter. */
  packCents: number | null;
  centsPerKg: number | null;
  priceSource: "mine" | "reference" | "none";
  aisle: string;
  estCents: number | null;
  usedIn: { recipeId: string; date: string; grams: number }[];
  freezable: boolean;
  openDays: number | null;
  /** Vrai quand un reste est prévu ET qu'aucun autre repas ne le consomme. */
  orphaned: boolean;
  /** « about 5 carrots » : ce qu'on cherche des yeux en rayon, sans balance. */
  hint: string | null;
  /** Combien de jours ça tient une fois acheté : ce qui distingue un achat unique d'un frais. */
  keepDays: number;
  /** Ce qu'il faut congeler à l'arrivée des courses pour que rien ne se perde. */
  freezeG: number;
  /** Le dernier repas qui consomme ce lot, pour justifier la congélation. */
  lastUseDate: string | null;
}

export interface GroceryList {
  lines: GroceryLine[];
  byAisle: Record<string, GroceryLine[]>;
  /** Épices et condiments : à vérifier dans le placard, pas à acheter par défaut. */
  pantryCheck: GroceryLine[];
  /** Déjà couvert par le stock : rien à acheter. */
  covered: GroceryLine[];
  /** Ce que coûte vraiment la semaine : paquets périssables + part consommée du placard. */
  estimatedCents: number | null;
  /** Ce que coûterait le réassort complet du placard, si tout était à racheter. */
  pantryRestockCents: number | null;
  totalOrphanG: number;
  orphanedLines: GroceryLine[];
}

const AISLE_ORDER = [
  "primeur",
  "boucherie",
  "poissonnerie",
  "charcuterie",
  "frais",
  "surgeles",
  "boulangerie",
  "epicerie",
  "conserves",
  "monde",
  "apero",
];

export function buildGroceryList(
  meals: PlannedMeal[],
  gramsByMeal: Record<string, Record<string, number>>,
  recipeById: Map<string, PlannerRecipe>,
  slotById: Map<string, PlannerSlot>,
  concepts: Record<string, ConceptMeta>,
  pantry: PantryLot[],
  lang: "en" | "fr" = "en",
  /** Produits de placard que default-user a déclaré ne PAS avoir : ils passent à l'achat. */
  forceBuy: Set<string> = new Set(),
  /** Jour des courses : point de départ de la fraîcheur. */
  shoppingDate: string = new Date().toISOString().slice(0, 10),
): GroceryList {
  const needed = new Map<string, number>();
  const usage = new Map<string, { recipeId: string; date: string; grams: number }[]>();

  for (const meal of meals) {
    const grams = gramsByMeal[meal.slotId];
    const slot = slotById.get(meal.slotId);
    if (!grams || !slot) continue;
    for (const [conceptId, g] of Object.entries(grams)) {
      if (g <= 0) continue;
      needed.set(conceptId, (needed.get(conceptId) ?? 0) + g);
      const list = usage.get(conceptId) ?? [];
      list.push({ recipeId: meal.recipeId, date: slot.date, grams: g });
      usage.set(conceptId, list);
    }
  }

  const pantryByConcept = new Map<string, number>();
  for (const lot of pantry) {
    pantryByConcept.set(lot.conceptId, (pantryByConcept.get(lot.conceptId) ?? 0) + lot.grams);
  }

  const lines: GroceryLine[] = [];
  for (const [conceptId, neededG] of needed) {
    const meta = concepts[conceptId];
    const plan = planPurchase({
      conceptId,
      neededG,
      pantryG: pantryByConcept.get(conceptId) ?? 0,
      packageSizeG: meta?.packageG ?? null,
      boughtByWeight: meta?.boughtByWeight ?? false,
      openDays: meta?.openDays ?? null,
      freezable: meta?.freezable ?? false,
      horizonDays: 7,
    });
    const uses = usage.get(conceptId) ?? [];
    lines.push({
      ...plan,
      staple: meta?.staple ?? false,
      centsPerKg: meta?.centsPerKg ?? null,
      priceSource: meta?.priceSource ?? "none",
      aisle: meta?.aisle ?? "epicerie",
      estCents: meta?.centsPerKg
        ? Math.round(((meta.staple ? plan.neededG : plan.boughtG) / 1000) * meta.centsPerKg)
        : null,
      packCents: meta?.centsPerKg ? Math.round((plan.boughtG / 1000) * meta.centsPerKg) : null,
      usedIn: uses.sort((a, b) => a.date.localeCompare(b.date)),
      freezable: meta?.freezable ?? false,
      openDays: meta?.openDays ?? null,
      orphaned: plan.orphanRiskG > 15,
      ...freezeAdvice(uses, meta, plan.boughtG, shoppingDate),
      hint: shoppingHint(plan.boughtG > 0 ? plan.boughtG : plan.neededG, meta, lang),
      keepDays: meta?.keepDays ?? 7,
    });
  }

  lines.sort((a, b) => {
    const ai = AISLE_ORDER.indexOf(a.aisle);
    const bi = AISLE_ORDER.indexOf(b.aisle);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.boughtG - a.boughtG;
  });

  const covered = lines.filter((l) => l.toBuyG <= 0);
  const needsBuying = lines.filter((l) => l.toBuyG > 0);
  const buyLines = needsBuying.filter((l) => !l.staple || forceBuy.has(l.conceptId));
  const pantryCheck = needsBuying.filter((l) => l.staple && !forceBuy.has(l.conceptId));

  const byAisle: Record<string, GroceryLine[]> = {};
  for (const line of buyLines) {
    (byAisle[line.aisle] ??= []).push(line);
  }

  const priced = [...buyLines, ...pantryCheck].filter((l) => l.estCents !== null);
  const estimatedCents = priced.length === 0 ? null : priced.reduce((s, l) => s + (l.estCents ?? 0), 0);
  const restock = pantryCheck.filter((l) => l.packCents !== null);
  const pantryRestockCents =
    restock.length === 0 ? null : restock.reduce((s, l) => s + (l.packCents ?? 0), 0);

  return {
    lines: buyLines,
    byAisle,
    pantryCheck,
    covered,
    estimatedCents,
    pantryRestockCents,
    totalOrphanG: buyLines.reduce((s, l) => s + l.orphanRiskG, 0),
    orphanedLines: buyLines.filter((l) => l.orphaned),
  };
}

/**
 * Ce qui ne tiendra pas jusqu'au repas qui le consomme doit partir au congélateur
 * le jour même. On ne le devine pas : on compare la date de chaque repas à la
 * durée de fraîcheur de l'aliment.
 */
function freezeAdvice(
  uses: { recipeId: string; date: string; grams: number }[],
  meta: ConceptMeta | undefined,
  boughtG: number,
  shoppingDate: string,
): { freezeG: number; lastUseDate: string | null } {
  const sorted = [...uses].sort((a, b) => a.date.localeCompare(b.date));
  const lastUseDate = sorted.length > 0 ? sorted[sorted.length - 1]!.date : null;
  if (!meta?.freezable || boughtG <= 0) return { freezeG: 0, lastUseDate };

  const bought = Date.parse(shoppingDate);
  let beyond = 0;
  for (const u of sorted) {
    const days = (Date.parse(u.date) - bought) / 86400000;
    if (days > meta.keepDays) beyond += u.grams;
  }
  // Arrondi à 10 g : personne ne congèle 37 grammes de poulet.
  return { freezeG: Math.round(beyond / 10) * 10, lastUseDate };
}

/** Formatage humain d'une quantité : au gramme sous 1 kg, en kilos au-dessus. */
export function formatGrams(g: number): string {
  if (g >= 1000) return `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 2)} kg`;
  return `${Math.round(g)} g`;
}

export function formatPackages(line: GroceryLine): string {
  if (line.packages === null || line.packageSizeG === null) return formatGrams(line.boughtG);
  if (line.packages === 1) return `1 x ${formatGrams(line.packageSizeG)}`;
  return `${line.packages} x ${formatGrams(line.packageSizeG)}`;
}
