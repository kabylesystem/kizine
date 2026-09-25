import { buildListFor } from "../src/server/grocery-service";
import { mondayOf } from "../src/server/plan-service";
import { migrate } from "../src/db/client";

await migrate();
const data = await buildListFor(mondayOf());
if (!data) {
  console.log("aucun plan");
} else {
  const { list, names } = data;
  console.log(`à acheter : ${list.lines.length} lignes`);
  console.log(`placard   : ${list.pantryCheck.length} lignes`);
  console.log(`orphelins : ${list.orphanedLines.length} lignes, ${Math.round(list.totalOrphanG)} g à risque`);
  const byAisle = Object.entries(list.byAisle).map(([a, l]) => `${a}:${l.length}`);
  console.log(byAisle.join("  "));
  console.log("\ntop 10 volumes :");
  for (const l of [...list.lines].sort((a, b) => b.boughtG - a.boughtG).slice(0, 10)) {
    console.log(`  ${(names[l.conceptId] ?? l.conceptId).padEnd(22)} ${Math.round(l.boughtG)} g`);
  }
}
