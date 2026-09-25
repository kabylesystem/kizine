import { loadCiqual, nutrientsOf } from "./lib/ciqual";
import { resolveFood } from "./lib/resolve";
import { allConcepts } from "../src/data/concepts";

const dbx = loadCiqual("data/raw");
let missing = 0;
let suspicious = 0;
for (const c of allConcepts) {
  const r = resolveFood(dbx, c.raw);
  const flag = r.code === null ? "MISSING" : "";
  if (r.code === null) missing++;
  const n = r.code ? nutrientsOf(dbx, r.code) : null;
  const noKcal = r.code !== null && (n?.kcal === null || n?.kcal === undefined);
  if (noKcal) suspicious++;
  if (flag || noKcal || process.env.ALL) {
    console.log(`${flag || "NOKCAL"}  ${c.id.padEnd(20)} <- ${typeof c.raw === "number" ? c.raw : c.raw}  => ${r.name}`);
  }
}
console.log(`\n${allConcepts.length} concepts | ${missing} introuvables | ${suspicious} sans kcal`);
