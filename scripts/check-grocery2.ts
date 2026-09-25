import { buildListFor } from "../src/server/grocery-service";
import { migrate } from "../src/db/client";
await migrate();
const week = process.argv[2]!;
const data = await buildListFor(week);
if (!data) console.log("aucun plan");
else {
  const { list, names } = data;
  console.log(`semaine ${week}`);
  console.log(`  à acheter : ${list.lines.length} | placard : ${list.pantryCheck.length} | déjà en stock : ${list.covered.length}`);
  console.log(`  orphelins : ${list.orphanedLines.length}, ${Math.round(list.totalOrphanG)} g à risque`);
  for (const l of list.orphanedLines.slice(0, 5)) {
    console.log(`    ${(names[l.conceptId] ?? l.conceptId).padEnd(20)} reste ${Math.round(l.leftoverG)} g sur ${Math.round(l.boughtG)} g`);
  }
}
