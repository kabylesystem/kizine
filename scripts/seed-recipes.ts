import { allRecipes } from "../src/data/recipes/index";
import { titlesEn } from "../src/data/recipes/titles-en";
import { allConcepts } from "../src/data/concepts";
import { migrate, rawDb } from "../src/db/client";

await migrate();
const conn = rawDb();
const known = new Set(allConcepts.map((c) => c.id));

const problems: string[] = [];
for (const r of allRecipes) {
  for (const row of r.ing) {
    if (!known.has(row[0])) problems.push(`${r.id} -> concept inconnu : ${row[0]}`);
    const [, , ref, min, max] = row;
    if (min > ref || ref > max) problems.push(`${r.id} -> ${row[0]} : plage incohérente ${min}/${ref}/${max}`);
    if (min < 0) problems.push(`${r.id} -> ${row[0]} : min négatif`);
  }
  if (r.ing.length === 0) problems.push(`${r.id} -> aucun ingrédient`);
  if (r.steps.length === 0) problems.push(`${r.id} -> aucune étape`);
  if (!titlesEn[r.id]) problems.push(`${r.id} -> titre anglais manquant`);
}
if (problems.length) {
  console.error("recettes invalides :");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}


try {
  conn.exec("DELETE FROM recipe_ingredients");
  conn.exec("DELETE FROM recipe_steps");
  conn.exec("DELETE FROM substitutions");

  const recipeStmt = conn.prepare(`
    INSERT INTO recipes
      (id, title, title_en, cuisine, slot_kinds, flavor_profiles, techniques, textures, base_servings,
       active_minutes, passive_minutes, pans_needed, equipment_required, difficulty, spice_level,
       leftover_tolerance_days, prep_aheadable, portable, good_cold, reheatable, kcal_density,
       source_url, image_id, notes, enabled)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, title_en = excluded.title_en, cuisine = excluded.cuisine,
      slot_kinds = excluded.slot_kinds, flavor_profiles = excluded.flavor_profiles,
      techniques = excluded.techniques, textures = excluded.textures,
      active_minutes = excluded.active_minutes, passive_minutes = excluded.passive_minutes,
      pans_needed = excluded.pans_needed, equipment_required = excluded.equipment_required,
      difficulty = excluded.difficulty, spice_level = excluded.spice_level,
      leftover_tolerance_days = excluded.leftover_tolerance_days,
      prep_aheadable = excluded.prep_aheadable, portable = excluded.portable,
      good_cold = excluded.good_cold, reheatable = excluded.reheatable,
      notes = excluded.notes, enabled = excluded.enabled`);
  const ingStmt = conn.prepare(`
    INSERT INTO recipe_ingredients
      (recipe_id, position, concept_id, expected_state, role, ref_g, min_g, max_g, adjustable, stiffness, optional, note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const stepStmt = conn.prepare(
    "INSERT INTO recipe_steps (recipe_id, position, text, equipment, timer_seconds, is_prep_ahead, uses_concept_ids) VALUES (?,?,?,?,?,?,?)",
  );
  const subStmt = conn.prepare(
    "INSERT INTO substitutions (recipe_id, concept_id, replacement_concept_id, ratio, quality_penalty, note) VALUES (?,?,?,?,?,?)",
  );

  for (const r of allRecipes) {
    await recipeStmt.run(
      r.id,
      r.title,
      titlesEn[r.id] ?? r.titleEn ?? null,
      r.cuisine,
      JSON.stringify(r.slots),
      JSON.stringify(r.flavors),
      JSON.stringify(r.techniques),
      JSON.stringify(r.textures ?? []),
      1,
      r.active,
      r.passive ?? 0,
      r.pans ?? 1,
      JSON.stringify(r.equip ?? []),
      r.difficulty ?? 2,
      r.spice ?? 0,
      r.leftoverDays ?? 1,
      r.prepAhead ? 1 : 0,
      r.portable ? 1 : 0,
      r.goodCold ? 1 : 0,
      r.reheatable === false ? 0 : 1,
      null,
      null,
      null,
      r.notes ?? null,
      1,
    );
    for (const [i, row] of r.ing.entries()) {
      const [conceptId, role, ref, min, max, stiffness, opts] = row;
      await ingStmt.run(
        r.id,
        i,
        conceptId,
        opts?.state ?? "raw",
        role,
        ref,
        min,
        max,
        min === max ? 0 : 1,
        stiffness ?? 1,
        opts?.optional ? 1 : 0,
        opts?.note ?? null,
      );
    }
    for (const [i, text] of r.steps.entries()) {
      await stepStmt.run(r.id, i, text, null, null, 0, JSON.stringify([]));
    }
    for (const [from, to, ratio] of r.subs ?? []) {
      await subStmt.run(r.id, from, to, ratio ?? 1, 0.1, null);
    }
  }

} catch (err) {
  conn.exec("ROLLBACK");
  throw err;
}

const counts = await conn
  .prepare(
    "SELECT (SELECT COUNT(*) FROM recipes) r, (SELECT COUNT(*) FROM recipe_ingredients) i, (SELECT COUNT(*) FROM recipe_steps) s",
  )
  .get() as { r: number; i: number; s: number };
console.log(`recettes: ${counts.r} | ingrédients: ${counts.i} | étapes: ${counts.s}`);
