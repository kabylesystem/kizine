import { loadNutrition, loadRecipes, loadConcepts } from "../src/db/repo";
import { migrate } from "../src/db/client";
import { buildSlots, defaultDayProfiles } from "../src/core/schedule";
import { planWeek, explain } from "../src/core/planner";
import { displayMacros } from "../src/core/nutrition";
import type { PlannerContext } from "../src/core/planner-types";

await migrate();
const index = await loadNutrition();
const recipes = await loadRecipes(index);
const concepts = await loadConcepts();
console.log(`${recipes.length} recettes exploitables sur 109`);

const slots = buildSlots({
  weekStart: "2026-08-31",
  dayProfiles: defaultDayProfiles(),
  kcalTarget: 3200,
  proteinTarget: 180,
  dailyToleranceKcal: 150,
  shoppingWeekday: 2,
});

const ctx: PlannerContext = {
  slots,
  recipes,
  affinity: {},
  banned: new Set(),
  dishElo: {},
  frequencyPerWeek: {},
  equipment: new Set(["stovetop", "oven", "microwave", "rice-cooker", "blender", "freezer", "scale"]),
  spiceTolerance: 3,
  maxPans: 3,
  pantry: [],
  concepts,
  routineSlots: new Set(["breakfast", "snack"] as const),
  mainSlots: new Set(["lunch", "dinner"] as const),
  meatPerMainMealG: 300,
  weeklyBudgetCents: 9000,
  budgetPerMealCents: Math.round(9000 / slots.length),
  seed: 42,
};

const t = Date.now();
const plan = planWeek(ctx);
const ms = Date.now() - t;

const byId = new Map(recipes.map((r) => [r.id, r]));
const slotById = new Map(slots.map((s) => [s.id, s]));

let day = "";
let dayKcal = 0;
let dayProt = 0;
for (const m of plan.meals) {
  const s = slotById.get(m.slotId)!;
  if (s.date !== day) {
    if (day) console.log(`   >>> ${Math.round(dayKcal)} kcal, ${Math.round(dayProt)} g de protéines\n`);
    day = s.date;
    dayKcal = 0;
    dayProt = 0;
    console.log(`== ${s.date}`);
  }
  const r = byId.get(m.recipeId)!;
  const d = displayMacros(m.estimate);
  dayKcal += m.estimate.kcal;
  dayProt += m.estimate.protein;
  console.log(
    `  ${s.slot.padEnd(9)} ${r.title.padEnd(34)} ${String(d.kcal).padStart(4)} kcal  P${String(Math.round(d.protein)).padStart(3)}  cible ${s.kcalTarget}`,
  );
}
console.log(`   >>> ${Math.round(dayKcal)} kcal, ${Math.round(dayProt)} g de protéines`);

const uniqueRecipes = new Set(plan.meals.map((m) => m.recipeId)).size;
const cuisines = new Set(plan.meals.map((m) => byId.get(m.recipeId)!.cuisine));
console.log(`\nplan calculé en ${ms} ms`);
console.log(`score ${plan.score.toFixed(1)} | pénalités ${JSON.stringify(plan.penalties)}`);
console.log(`${plan.meals.length} repas, ${uniqueRecipes} recettes distinctes, ${cuisines.size} cuisines`);
console.log(`créneaux non remplis : ${plan.unfilled.length}`);
const sample = plan.meals[10];
if (sample) console.log(`\npourquoi « ${byId.get(sample.recipeId)!.title} » :\n  - ${explain(sample.breakdown).join("\n  - ")}`);
