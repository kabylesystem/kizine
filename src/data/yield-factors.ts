/**
 * Facteurs de rendement à la cuisson : poids cuit / poids cru (ou sec).
 * Sources : USDA Table of Cooking Yields for Meat and Poultry Release 2 (ARS),
 * USDA Table of Nutrient Retention Factors Release 6, et mesures CIQUAL cru/cuit
 * quand les deux états existent.
 *
 * Le domaine stocke TOUJOURS le poids d'achat (cru ou sec) : c'est ce qui se pèse
 * et ce qui s'achète. Le poids cuit est dérivé de ces facteurs, jamais stocké.
 */
export interface YieldSeed {
  concept: string;
  from: "raw" | "dry";
  to: "cooked";
  method: string;
  factor: number;
  source: string;
}

export const yieldSeeds: YieldSeed[] = [
  { concept: "chicken-breast", from: "raw", to: "cooked", method: "pan", factor: 0.73, source: "USDA cooking yields, broiler breast, braised/roasted" },
  { concept: "chicken-breast", from: "raw", to: "cooked", method: "oven", factor: 0.75, source: "USDA cooking yields" },
  { concept: "chicken-thigh", from: "raw", to: "cooked", method: "oven", factor: 0.75, source: "USDA cooking yields, thigh roasted" },
  { concept: "chicken-drumstick", from: "raw", to: "cooked", method: "oven", factor: 0.74, source: "USDA cooking yields" },
  { concept: "turkey-escalope", from: "raw", to: "cooked", method: "pan", factor: 0.72, source: "USDA cooking yields, turkey breast" },
  { concept: "beef-steak", from: "raw", to: "cooked", method: "pan", factor: 0.73, source: "USDA cooking yields, beef steak broiled" },
  { concept: "beef-mince-5", from: "raw", to: "cooked", method: "pan", factor: 0.75, source: "USDA cooking yields, ground beef pan-broiled" },
  { concept: "beef-mince-15", from: "raw", to: "cooked", method: "pan", factor: 0.72, source: "USDA cooking yields, ground beef pan-broiled" },
  { concept: "beef-braising", from: "raw", to: "cooked", method: "braise", factor: 0.65, source: "USDA cooking yields, beef chuck braised" },
  { concept: "lamb-shoulder", from: "raw", to: "cooked", method: "braise", factor: 0.68, source: "USDA cooking yields, lamb shoulder braised" },
  { concept: "lamb-chops", from: "raw", to: "cooked", method: "grill", factor: 0.72, source: "USDA cooking yields, lamb loin broiled" },
  { concept: "merguez", from: "raw", to: "cooked", method: "grill", factor: 0.72, source: "CIQUAL 30150 vs 30155" },
  { concept: "pork-loin", from: "raw", to: "cooked", method: "pan", factor: 0.73, source: "USDA cooking yields, pork tenderloin roasted" },
  { concept: "duck-breast", from: "raw", to: "cooked", method: "pan", factor: 0.68, source: "USDA cooking yields, duck breast" },
  { concept: "salmon", from: "raw", to: "cooked", method: "oven", factor: 0.79, source: "USDA fish cooking yield, salmon baked" },
  { concept: "cod", from: "raw", to: "cooked", method: "oven", factor: 0.78, source: "USDA fish cooking yield, cod baked" },
  { concept: "white-fish", from: "raw", to: "cooked", method: "pan", factor: 0.78, source: "USDA fish cooking yield" },
  { concept: "shrimp", from: "raw", to: "cooked", method: "pan", factor: 0.82, source: "USDA shellfish cooking yield" },
  { concept: "squid", from: "raw", to: "cooked", method: "pan", factor: 0.72, source: "USDA shellfish cooking yield" },
  { concept: "egg", from: "raw", to: "cooked", method: "boil", factor: 0.9, source: "CIQUAL 22000 vs 22010, perte d'eau à la coque" },

  { concept: "rice-basmati", from: "dry", to: "cooked", method: "boil", factor: 2.7, source: "CIQUAL 9119 vs 9125, absorption d'eau" },
  { concept: "rice-white", from: "dry", to: "cooked", method: "boil", factor: 2.8, source: "CIQUAL 9119 vs 9104" },
  { concept: "rice-brown", from: "dry", to: "cooked", method: "boil", factor: 2.6, source: "mesure standard riz complet" },
  { concept: "pasta", from: "dry", to: "cooked", method: "boil", factor: 2.2, source: "CIQUAL 9810 vs 9811" },
  { concept: "pasta-wholegrain", from: "dry", to: "cooked", method: "boil", factor: 2.1, source: "étiquette pâtes complètes" },
  { concept: "noodles-wheat", from: "dry", to: "cooked", method: "boil", factor: 2.4, source: "mesure standard nouilles de blé" },
  { concept: "rice-noodles", from: "dry", to: "cooked", method: "boil", factor: 2.5, source: "mesure standard vermicelles de riz" },
  { concept: "couscous", from: "dry", to: "cooked", method: "steam", factor: 2.4, source: "CIQUAL 9681, hydratation 1:1,4" },
  { concept: "bulgur", from: "dry", to: "cooked", method: "boil", factor: 2.6, source: "CIQUAL 9690 vs 9691" },
  { concept: "quinoa", from: "dry", to: "cooked", method: "boil", factor: 2.4, source: "CIQUAL 9340 vs 9341" },
  { concept: "polenta", from: "dry", to: "cooked", method: "boil", factor: 4.5, source: "CIQUAL 9614 vs 9615" },
  { concept: "oats", from: "dry", to: "cooked", method: "boil", factor: 5.3, source: "CIQUAL 32140 vs 9313, porridge à l'eau" },
  { concept: "lentils-green", from: "dry", to: "cooked", method: "boil", factor: 2.5, source: "CIQUAL 20585 vs 20360" },
  { concept: "lentils-red", from: "dry", to: "cooked", method: "boil", factor: 2.4, source: "CIQUAL 20535 vs 20360" },
  { concept: "chickpeas-dry", from: "dry", to: "cooked", method: "boil", factor: 2.4, source: "CIQUAL 20516 vs 20507" },
  { concept: "semolina-fine", from: "dry", to: "cooked", method: "steam", factor: 2.4, source: "hydratation standard semoule" },

  { concept: "potato", from: "raw", to: "cooked", method: "boil", factor: 0.96, source: "CIQUAL 4008 vs 4003" },
  { concept: "potato", from: "raw", to: "cooked", method: "oven", factor: 0.78, source: "USDA vegetable yields, baked potato" },
  { concept: "sweet-potato", from: "raw", to: "cooked", method: "oven", factor: 0.82, source: "USDA vegetable yields" },
  { concept: "onion", from: "raw", to: "cooked", method: "pan", factor: 0.6, source: "USDA vegetable yields, sautéed onion" },
  { concept: "mushroom", from: "raw", to: "cooked", method: "pan", factor: 0.55, source: "USDA vegetable yields, sautéed mushrooms" },
  { concept: "spinach", from: "raw", to: "cooked", method: "pan", factor: 0.35, source: "USDA vegetable yields, wilted spinach" },
  { concept: "courgette", from: "raw", to: "cooked", method: "pan", factor: 0.75, source: "USDA vegetable yields" },
  { concept: "aubergine", from: "raw", to: "cooked", method: "oven", factor: 0.72, source: "USDA vegetable yields" },
  { concept: "bell-pepper", from: "raw", to: "cooked", method: "pan", factor: 0.8, source: "USDA vegetable yields" },
  { concept: "carrot", from: "raw", to: "cooked", method: "boil", factor: 0.92, source: "CIQUAL 20009 vs 20352" },
  { concept: "broccoli", from: "raw", to: "cooked", method: "steam", factor: 0.9, source: "CIQUAL 20057 vs 20303" },
  { concept: "green-beans", from: "raw", to: "cooked", method: "steam", factor: 0.9, source: "CIQUAL 20061 vs 20030" },
  { concept: "tomato", from: "raw", to: "cooked", method: "pan", factor: 0.65, source: "USDA vegetable yields, reduced tomatoes" },
];
