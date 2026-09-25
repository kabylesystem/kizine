import { rawDb } from "../src/db/client";
import { SHOPPING_UNITS } from "../src/data/units";

const db = rawDb();
let written = 0;
let skipped = 0;
for (const [conceptId, unit] of Object.entries(SHOPPING_UNITS)) {
  const exists = await db.prepare("SELECT id FROM food_concepts WHERE id = ?").get(conceptId);
  if (!exists) {
    skipped++;
    continue;
  }
  await db.prepare(
    `INSERT INTO food_densities (concept_id, g_per_ml, g_per_tbsp, g_per_tsp, g_per_unit, unit_label, source)
     VALUES (?, 1, NULL, NULL, ?, ?, 'calibre supermarche')
     ON CONFLICT(concept_id) DO UPDATE SET
       g_per_unit = excluded.g_per_unit,
       unit_label = excluded.unit_label`,
  ).run(conceptId, unit.gPerUnit, unit.unitLabel);
  written++;
}
console.log(`unités: ${written} écrites, ${skipped} concepts inconnus`);

import { UNIT_LABEL_EN } from "../src/data/units";
let renamed = 0;
for (const [fr, en] of Object.entries(UNIT_LABEL_EN)) {
  const res = await db.prepare("UPDATE food_densities SET unit_label = ? WHERE unit_label = ?").run(en, fr);
  renamed += Number(res.changes ?? 0);
}
console.log(`libellés traduits: ${renamed}`);
