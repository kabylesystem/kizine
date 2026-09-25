import { loadCiqual, nutrientsOf, normalize, hasTerm } from "./lib/ciqual";
const dbx = loadCiqual("data/raw");
const queries = process.argv.slice(2);
for (const q of queries) {
  const terms = q.split("+").map(normalize);
  console.log(`\n### ${q}`);
  let n = 0;
  for (const f of dbx.foods.values()) {
    const hay = normalize(f.nameFr);
    if (!terms.every((t) => hasTerm(hay, t))) continue;
    const x = nutrientsOf(dbx, f.code);
    console.log(`${f.code}  ${String(x.kcal ?? "-").padStart(5)}kcal P${x.protein ?? "-"} G${x.carb ?? "-"} L${x.fat ?? "-"}  ${f.nameFr}`);
    if (++n >= 4) break;
  }
  if (n === 0) console.log("  (rien)");
}
