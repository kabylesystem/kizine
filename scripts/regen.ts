import { generateAndStorePlan, planningWeekOf } from "../src/server/plan-service";
const week = process.argv[2] ?? planningWeekOf();
await generateAndStorePlan(week);
console.log(`plan regénéré pour ${week}`);
