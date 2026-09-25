import { createClient } from "@libsql/client";
import { join } from "node:path";

/**
 * Copie la base locale vers Turso, table par table, dans l'ordre des clés
 * étrangères. Un `.dump` SQLite ne passe pas : il recrée les tables dans un
 * ordre arbitraire et Turso refuse les références vers une table absente.
 * Ici le schéma vient déjà des migrations, on ne pousse que les lignes.
 */
/**
 * `__migrations` n'est JAMAIS copiée : recopier le journal du local ferait
 * croire à la base distante que des migrations y ont tourné alors que ses
 * colonnes n'existent pas. C'est exactement le bug qu'on a payé une fois.
 */
const ORDER = [
  "users", "nutrition_profiles", "goals", "storage_locations", "stores",
  "nutrition_sources", "food_concepts", "foods", "yield_factors", "food_densities",
  "ingredient_aliases", "off_products", "image_assets",
  "recipes", "recipe_ingredients", "recipe_steps", "substitutions",
  "equipment", "preferences", "cuisine_preferences", "dish_ratings",
  "swipe_events", "duel_events", "fatigue_states",
  "day_profiles", "day_overrides", "weight_logs", "training_sessions", "commutes",
  "pantry_items", "inventory_events", "pantry_declarations",
  "meal_plans", "meal_slots", "recipe_instances", "meals", "cooking_feedback",
  "grocery_lists", "grocery_list_items", "purchases", "purchase_items",
  "price_observations", "receipts",
];

const local = createClient({ url: `file:${join(process.cwd(), "data", "cuisine.sqlite")}` });
const remote = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const known = new Set(
  (await local.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) => String(r.name)),
);

let totalRows = 0;
for (const table of ORDER) {
  if (!known.has(table)) {
    console.log(`${table.padEnd(22)} absente en local, ignorée`);
    continue;
  }
  const src = await local.execute(`SELECT * FROM ${table}`);
  if (src.rows.length === 0) {
    console.log(`${table.padEnd(22)} vide`);
    continue;
  }
  const cols = src.columns;
  const placeholders = cols.map(() => "?").join(",");
  const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`;

  await remote.execute(`DELETE FROM ${table}`);
  // Par paquets : une base distante n'aime pas quatre mille allers-retours.
  const CHUNK = 200;
  for (let i = 0; i < src.rows.length; i += CHUNK) {
    const batch = src.rows.slice(i, i + CHUNK).map((row) => ({
      sql,
      args: cols.map((c) => (row as unknown as Record<string, unknown>)[c] ?? null),
    }));
    await remote.batch(batch as never, "write");
  }
  totalRows += src.rows.length;
  console.log(`${table.padEnd(22)} ${String(src.rows.length).padStart(5)} lignes`);
}
console.log(`\n${totalRows} lignes copiées vers Turso`);
