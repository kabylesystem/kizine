export interface PurchasePlan {
  conceptId: string;
  neededG: number;
  fromPantryG: number;
  toBuyG: number;
  packageSizeG: number | null;
  packages: number | null;
  boughtG: number;
  leftoverG: number;
  /** Coût de l'orphelinage : grammes qui vont probablement finir à la poubelle. */
  orphanRiskG: number;
}

export interface PackagingInput {
  conceptId: string;
  neededG: number;
  pantryG?: number;
  packageSizeG?: number | null;
  boughtByWeight?: boolean;
  /** Jours avant péremption une fois ouvert. Plus c'est court, plus un reste est risqué. */
  openDays?: number | null;
  /** Horizon du plan, en jours. */
  horizonDays?: number;
  freezable?: boolean;
}

/**
 * Convertit un besoin théorique en achat réel.
 * Un besoin de 2,74 kg de poulet avec des barquettes de 1 kg donne 3 barquettes
 * et 260 g de reste, qui entrent en stock.
 */
export function planPurchase(input: PackagingInput): PurchasePlan {
  const horizon = input.horizonDays ?? 7;
  const fromPantry = Math.min(input.pantryG ?? 0, input.neededG);
  const toBuy = Math.max(0, input.neededG - fromPantry);

  if (toBuy === 0) {
    return {
      conceptId: input.conceptId,
      neededG: input.neededG,
      fromPantryG: fromPantry,
      toBuyG: 0,
      packageSizeG: input.packageSizeG ?? null,
      packages: 0,
      boughtG: 0,
      leftoverG: 0,
      orphanRiskG: 0,
    };
  }

  if (input.boughtByWeight || !input.packageSizeG) {
    return {
      conceptId: input.conceptId,
      neededG: input.neededG,
      fromPantryG: fromPantry,
      toBuyG: toBuy,
      packageSizeG: input.packageSizeG ?? null,
      packages: null,
      boughtG: Math.ceil(toBuy / 10) * 10,
      leftoverG: Math.ceil(toBuy / 10) * 10 - toBuy,
      orphanRiskG: 0,
    };
  }

  const packages = Math.ceil(toBuy / input.packageSizeG);
  const boughtG = packages * input.packageSizeG;
  const leftoverG = boughtG - toBuy;

  return {
    conceptId: input.conceptId,
    neededG: input.neededG,
    fromPantryG: fromPantry,
    toBuyG: toBuy,
    packageSizeG: input.packageSizeG,
    packages,
    boughtG,
    leftoverG,
    orphanRiskG: orphanRisk(leftoverG, input.openDays ?? null, horizon, input.freezable ?? false),
  };
}

/**
 * Part du reste qui risque d'être perdue.
 * Un reste de crème fraîche à J+7 est perdu, un reste de riz ne l'est jamais.
 */
export function orphanRisk(
  leftoverG: number,
  openDays: number | null,
  horizonDays: number,
  freezable: boolean,
): number {
  if (leftoverG <= 0) return 0;
  if (openDays === null) return 0;
  if (freezable) return leftoverG * 0.1;
  if (openDays >= horizonDays * 2) return 0;
  const ratio = Math.min(1, Math.max(0, 1 - openDays / horizonDays));
  return leftoverG * ratio;
}

/** Score de pénalité normalisé, injecté dans le score du planificateur. */
export function orphanPenalty(plans: PurchasePlan[]): number {
  return plans.reduce((sum, p) => {
    if (p.boughtG === 0) return sum;
    return sum + p.orphanRiskG / p.boughtG;
  }, 0);
}
