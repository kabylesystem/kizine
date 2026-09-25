import { rawDb } from "../src/db/client";
import { planningWeekOf } from "../src/server/plan-service";

const db = rawDb();
const week = process.argv[2] ?? planningWeekOf();
const rows = (await db
  .prepare(
    `SELECT s.date, COUNT(*) AS n, ROUND(SUM(ri.kcal)) AS kcal, ROUND(SUM(ri.protein_g)) AS p
     FROM meal_slots s JOIN meal_plans pl ON pl.id = s.plan_id JOIN meals m ON m.slot_id = s.id
     JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
     WHERE pl.week_start = ? GROUP BY s.date ORDER BY s.date`,
  )
  .all(week)) as { date: string; n: number; kcal: number; p: number }[];
for (const r of rows) console.log(`${r.date}  ${r.n} repas  ${r.kcal} kcal  ${r.p} g`);
const dishes = await db
  .prepare(
    `SELECT COUNT(DISTINCT ri.recipe_id) AS c FROM meal_slots s
     JOIN meal_plans pl ON pl.id = s.plan_id JOIN meals m ON m.slot_id = s.id
     JOIN recipe_instances ri ON ri.id = m.recipe_instance_id WHERE pl.week_start = ?`,
  )
  .get(week);
const relaxed = await db
  .prepare(
    `SELECT ri.solver_status AS st, COUNT(*) AS c FROM meal_slots s
     JOIN meal_plans pl ON pl.id = s.plan_id JOIN meals m ON m.slot_id = s.id
     JOIN recipe_instances ri ON ri.id = m.recipe_instance_id WHERE pl.week_start = ? GROUP BY ri.solver_status`,
  )
  .all(week);
console.log("plats distincts :", dishes, "| solveur :", relaxed);
