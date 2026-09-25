import { buildListFor } from "../src/server/grocery-service";
import { mondayOf } from "../src/server/plan-service";
import { migrate, rawDb } from "../src/db/client";

await migrate();
const data = await buildListFor(mondayOf());
if (!data) console.log("aucun plan");
else {
  const { list, names } = data;
  const total = (list.estimatedCents ?? 0) + list.pantryCheck.reduce((s, l) => s + (l.estCents ?? 0), 0);
  const rows = await rawDb()
    .prepare(
      `SELECT SUM(ri.kcal) kcal, SUM(ri.protein_g) prot FROM meal_slots s
       JOIN meals m ON m.slot_id = s.id JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       JOIN meal_plans p ON p.id = s.plan_id WHERE p.week_start = ?`,
    )
    .get(mondayOf()) as { kcal: number; prot: number };
  console.log(`panier estimé      : ${(total / 100).toFixed(2)} €`);
  console.log(`coût par repas     : ${(total / 100 / 28).toFixed(2)} €`);
  console.log(`coût / 1000 kcal   : ${((total / 100 / rows.kcal) * 1000).toFixed(2)} €`);
  console.log(`coût / 100 g prot  : ${((total / 100 / rows.prot) * 100).toFixed(2)} €`);
  console.log("\nles 8 postes les plus chers :");
  for (const l of [...list.lines].sort((a, b) => (b.estCents ?? 0) - (a.estCents ?? 0)).slice(0, 8)) {
    console.log(`  ${(names[l.conceptId] ?? l.conceptId).padEnd(22)} ${((l.estCents ?? 0) / 100).toFixed(2)} €`);
  }
}
