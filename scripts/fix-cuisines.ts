import { rawDb } from "../src/db/client";

/**
 * Un smoothie, une tartine ou un bol de fromage blanc n'appartiennent à aucune
 * cuisine. Les ranger sous « american » ou « french » faute de mieux gonflait
 * ces compteurs et rendait le graphique faux. Ils passent en « everyday » :
 * de l'assemblage, pas une tradition.
 */
const MOVES: Record<string, string> = {
  "tartines-avocat-oeufs": "everyday",
  "snack-banane-chocolat-cacahuete": "everyday",
  "snack-shake-lait-cacao-dattes": "everyday",
  "snack-pancakes-proteines": "everyday",
  "snack-oeufs-durs-pain": "everyday",
  "snack-fromage-blanc-granola": "everyday",
  "salade-lentilles-feta": "everyday",
  "salade-quinoa-crevettes": "everyday",
  "snack-thon-crackers-avocat": "everyday",
  "oeufs-brouilles-saumon": "everyday",
  "bowl-cottage-fruits": "everyday",
  "overnight-oats-datte-tahini": "everyday",
};

const db = rawDb();
let moved = 0;
for (const [id, cuisine] of Object.entries(MOVES)) {
  const res = await db.prepare("UPDATE recipes SET cuisine = ? WHERE id = ?").run(cuisine, id);
  if (Number(res.changes) > 0) moved++;
  else console.log(`  introuvable : ${id}`);
}
console.log(`${moved} recettes reclassées`);
const after = (await db
  .prepare("SELECT cuisine, COUNT(*) AS c FROM recipes WHERE enabled = 1 GROUP BY cuisine ORDER BY c DESC")
  .all()) as { cuisine: string; c: number }[];
for (const r of after) console.log(`  ${String(r.c).padStart(3)}  ${r.cuisine}`);
