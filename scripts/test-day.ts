import { rawDb } from "../src/db/client";

const db = rawDb();
const date = process.argv[2] ?? "2026-09-03";
const rows = (await db
  .prepare(
    `SELECT s.slot, COALESCE(r.title_en, r.title) AS title, ROUND(ri.kcal) AS kcal
     FROM meal_slots s JOIN meals m ON m.slot_id = s.id
     JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
     JOIN recipes r ON r.id = ri.recipe_id
     WHERE s.date = ?
     ORDER BY CASE s.slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 ELSE 3 END`,
  )
  .all(date)) as { slot: string; title: string; kcal: number }[];

const total = rows.reduce((a, r) => a + Number(r.kcal), 0);
for (const r of rows) console.log(`  ${r.slot.padEnd(10)} ${String(r.kcal).padStart(5)}  ${r.title}`);
console.log(`  ${"TOTAL".padEnd(10)} ${String(total).padStart(5)}`);
