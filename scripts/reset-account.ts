import { rawDb } from "../src/db/client";

/**
 * Remet un compte à l'état neuf : plus de plans, plus de goûts, plus de stock,
 * et l'écran d'accueil redevient à lire. Sert à tester sans salir un vrai compte.
 */
const id = process.argv[2];
if (!id) {
  console.error("usage: reset-account <id>");
  process.exit(1);
}

/** Les tables qui portent vraiment une colonne user_id. Le reste part en cascade. */
const PERSONAL = [
  "meal_plans", "purchases", "pantry_items", "pantry_declarations",
  "preferences", "cuisine_preferences", "dish_ratings", "swipe_events", "duel_events",
  "fatigue_states", "day_overrides", "day_profiles", "weight_logs", "training_sessions",
  "commutes", "goals", "equipment", "receipts", "recipe_instances", "nutrition_profiles",
];

const db = rawDb();
await db.tx(async (trx) => {
  for (const t of PERSONAL) {
    await trx.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(id);
  }
  // Les plans du compte partent avec leurs créneaux et leurs repas, en cascade.
  await trx.prepare("UPDATE users SET onboarded_at = NULL, welcomed_at = NULL WHERE id = ?").run(id);
});
console.log(`compte ${id} remis à neuf`);
