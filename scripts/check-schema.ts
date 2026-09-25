import { createClient } from "@libsql/client";
import { join } from "node:path";

/**
 * Compare le schéma local et celui de Turso, colonne par colonne. À lancer
 * après chaque migration : une colonne manquante en production ne se voit
 * qu'au moment où une page plante.
 */
const local = createClient({ url: `file:${join(process.cwd(), "data", "cuisine.sqlite")}` });
const remote = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function columns(c: typeof local, table: string): Promise<Set<string>> {
  const res = await c.execute(`PRAGMA table_info(${table})`);
  return new Set(res.rows.map((r) => String(r.name)));
}

const tables = (
  await local.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
).rows.map((r) => String(r.name));

let problems = 0;
for (const t of tables) {
  if (t === "__migrations") continue;
  const [a, b] = await Promise.all([columns(local, t), columns(remote, t)]);
  if (b.size === 0) {
    console.log(`TABLE MANQUANTE   ${t}`);
    problems++;
    continue;
  }
  const missing = [...a].filter((c) => !b.has(c));
  if (missing.length > 0) {
    console.log(`COLONNES MANQUANTES  ${t}: ${missing.join(", ")}`);
    problems++;
  }
}
console.log(problems === 0 ? `${tables.length} tables identiques` : `${problems} écart(s)`);
