import { loadCiqual, nutrientsOf, normalize } from "./lib/ciqual";

const dbx = loadCiqual("data/raw");
const terms = process.argv.slice(2).map(normalize);
let count = 0;
for (const f of dbx.foods.values()) {
  const hay = normalize(f.nameFr);
  if (!terms.every((t) => hay.includes(t))) continue;
  const n = nutrientsOf(dbx, f.code);
  console.log(
    `${f.code}\t${n.kcal ?? "-"}kcal P${n.protein ?? "-"} G${n.carb ?? "-"} L${n.fat ?? "-"} F${n.fiber ?? "-"} [${n.confidence}]\t${f.nameFr}`,
  );
  if (++count > 45) break;
}
console.log(`-- ${count} results`);
