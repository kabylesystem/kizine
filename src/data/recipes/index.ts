import { breakfastRecipes } from "./breakfast";
import { snackRecipes } from "./snacks";
import { lunchRecipes } from "./lunch";
import { dinnerRecipesA } from "./dinner-a";
import { dinnerRecipesB } from "./dinner-b";
import type { RecipeSeed } from "./types";

export const allRecipes: RecipeSeed[] = [
  ...breakfastRecipes,
  ...snackRecipes,
  ...lunchRecipes,
  ...dinnerRecipesA,
  ...dinnerRecipesB,
];

const seen = new Set<string>();
for (const r of allRecipes) {
  if (seen.has(r.id)) throw new Error(`recette en double : ${r.id}`);
  seen.add(r.id);
}

export type { RecipeSeed };
