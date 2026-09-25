import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rawDb } from "@/db/client";
import { currentUserId } from "@/server/auth";
import { loadNutrition, nutritionFor } from "@/db/repo";
import { buildContext } from "@/server/plan-service";
import { loadHighs } from "@/core/highs";
import { solveMeal } from "@/core/solver";
import type { Macros } from "@/core/types";

export const FREE_PREFIX = "free:";
export const isFreeRecipe = (recipeId: string | null | undefined): boolean =>
  typeof recipeId === "string" && recipeId.startsWith(FREE_PREFIX);

export interface IngredientHit {
  key: string;
  label: string;
  detail: string;
  per100: Macros;
  conceptId: string | null;
}

const EMPTY: Macros = { kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 };

/** Aliments de la base et produits scannés, par nom. Les valeurs sont celles du cru, tel qu'acheté. */
export async function searchIngredients(q: string, lang: "en" | "fr"): Promise<IngredientHit[]> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const like = `%${needle}%`;
  const db = rawDb();
  const [index, concepts, products] = await Promise.all([
    loadNutrition(),
    db
      .prepare(
        `SELECT id, name_fr, name_en FROM food_concepts
         WHERE lower(name_fr) LIKE ? OR lower(name_en) LIKE ? OR id LIKE ?
         ORDER BY ${lang === "fr" ? "name_fr" : "name_en"} LIMIT 14`,
      )
      .all(like, like, like) as unknown as Promise<{ id: string; name_fr: string; name_en: string }[]>,
    db
      .prepare(
        `SELECT barcode, name, brand, concept_id, kcal_100, protein_100, carb_100, fat_100, fiber_100
         FROM off_products WHERE kcal_100 IS NOT NULL AND (lower(name) LIKE ? OR lower(COALESCE(brand,'')) LIKE ?)
         ORDER BY scan_count DESC LIMIT 6`,
      )
      .all(like, like) as unknown as Promise<
      {
        barcode: string;
        name: string;
        brand: string | null;
        concept_id: string | null;
        kcal_100: number;
        protein_100: number | null;
        carb_100: number | null;
        fat_100: number | null;
        fiber_100: number | null;
      }[]
    >,
  ]);

  const hits: IngredientHit[] = [];
  for (const p of products) {
    hits.push({
      key: `p:${p.barcode}`,
      label: p.name,
      detail: `${p.brand ? `${p.brand} · ` : ""}${Math.round(p.kcal_100)} kcal / 100 g · ${lang === "fr" ? "scanné" : "scanned"}`,
      per100: {
        kcal: p.kcal_100,
        protein: p.protein_100 ?? 0,
        carb: p.carb_100 ?? 0,
        fat: p.fat_100 ?? 0,
        fiber: p.fiber_100 ?? 0,
      },
      conceptId: p.concept_id,
    });
  }
  for (const c of concepts) {
    const per100 = nutritionFor(index, c.id, "raw");
    if (!per100) continue;
    hits.push({
      key: `c:${c.id}`,
      label: lang === "fr" ? c.name_fr : c.name_en,
      detail: `${Math.round(per100.kcal)} kcal / 100 g · ${Math.round(per100.protein)} g P`,
      per100,
      conceptId: c.id,
    });
  }
  return hits;
}

export interface FreeLine {
  key: string;
  grams: number;
}

export interface FreeDishInput {
  title: string;
  portions: number;
  lines: FreeLine[];
  takeStock: boolean;
  /** Estimation directe, sans ingrédients : « ≈ 700 kcal, 40 g de protéines ». */
  direct?: { kcal: number; protein: number };
  /** Confiance imposée (photo sans masse = rough même avec des ingrédients). */
  precision?: "known" | "rough";
  /** État nutritionnel par ligne (cooked / raw), pour une photo d'assiette servie. */
  states?: Record<string, string>;
}

async function resolveLine(key: string, state = "raw"): Promise<{ label: string; per100: Macros; conceptId: string | null } | null> {
  const db = rawDb();
  if (key.startsWith("p:")) {
    const p = (await db
      .prepare("SELECT name, concept_id, kcal_100, protein_100, carb_100, fat_100, fiber_100 FROM off_products WHERE barcode = ?")
      .get(key.slice(2))) as
      | { name: string; concept_id: string | null; kcal_100: number | null; protein_100: number | null; carb_100: number | null; fat_100: number | null; fiber_100: number | null }
      | undefined;
    if (!p || p.kcal_100 === null) return null;
    return {
      label: p.name,
      per100: { kcal: p.kcal_100, protein: p.protein_100 ?? 0, carb: p.carb_100 ?? 0, fat: p.fat_100 ?? 0, fiber: p.fiber_100 ?? 0 },
      conceptId: p.concept_id,
    };
  }
  if (key.startsWith("c:")) {
    const id = key.slice(2);
    const [index, c] = await Promise.all([
      loadNutrition(),
      db.prepare("SELECT name_en FROM food_concepts WHERE id = ?").get(id) as Promise<{ name_en: string } | undefined>,
    ]);
    const per100 = nutritionFor(index, id, state);
    if (!c || !per100) return null;
    return { label: c.name_en, per100, conceptId: id };
  }
  return null;
}

/**
 * Crée le plat : totaux à partir des ingrédients tels qu'achetés, recette
 * fantôme désactivée (le planificateur ne la verra jamais), et le stock baisse
 * tout de suite si demandé, puisque la casserole est déjà faite.
 */
export async function createFreeDish(input: FreeDishInput): Promise<{ id: string; kcalPerPortion: number }> {
  const db = rawDb();
  const userId = await currentUserId();
  const now = Math.floor(Date.now() / 1000);

  const lines: { key: string; label: string; grams: number; per100: Macros; conceptId: string | null }[] = [];
  for (const l of input.lines) {
    if (!(l.grams > 0)) continue;
    const r = await resolveLine(l.key, input.states?.[l.key] ?? "raw");
    if (!r) continue;
    lines.push({ key: l.key, label: r.label, grams: l.grams, per100: r.per100, conceptId: r.conceptId });
  }
  if (lines.length === 0 && !input.direct) throw new Error("no usable ingredient");

  const totals: Macros = { ...EMPTY };
  let totalG = 0;
  if (input.direct) {
    totals.kcal = input.direct.kcal;
    totals.protein = input.direct.protein;
  }
  for (const l of lines) {
    const f = l.grams / 100;
    totals.kcal += l.per100.kcal * f;
    totals.protein += l.per100.protein * f;
    totals.carb += l.per100.carb * f;
    totals.fat += l.per100.fat * f;
    totals.fiber += l.per100.fiber * f;
    totalG += l.grams;
  }
  const portions = Math.max(1, Math.round(input.portions));
  const per = (v: number) => Math.round((v / portions) * 10) / 10;

  const gramsByConcept = new Map<string, number>();
  for (const l of lines) {
    if (!l.conceptId) continue;
    gramsByConcept.set(l.conceptId, (gramsByConcept.get(l.conceptId) ?? 0) + l.grams);
  }

  const id = randomUUID();
  const recipeId = `${FREE_PREFIX}${id}`;
  const title = input.title.trim().slice(0, 80) || "Batch dish";

  await db.tx(async (trx) => {
    await trx
      .prepare(
        `INSERT INTO recipes (id, title, title_en, cuisine, slot_kinds, flavor_profiles, techniques, textures, base_servings,
           active_minutes, passive_minutes, pans_needed, equipment_required, difficulty, spice_level, leftover_tolerance_days,
           prep_aheadable, portable, good_cold, reheatable, kcal_density, source_url, image_id, notes, enabled)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,0)`,
      )
      .run(
        recipeId,
        title,
        title,
        "everyday",
        JSON.stringify(["lunch", "dinner"]),
        "[]",
        "[]",
        "[]",
        portions,
        5,
        0,
        1,
        "[]",
        1,
        0,
        4,
        1,
        1,
        0,
        1,
        totalG > 0 ? Math.round((totals.kcal / totalG) * 1000) / 10 : null,
        "free",
      );
    let position = 1;
    for (const [conceptId, grams] of gramsByConcept) {
      const perPortion = Math.round((grams / portions) * 10) / 10;
      await trx
        .prepare(
          `INSERT INTO recipe_ingredients (recipe_id, position, concept_id, expected_state, role, ref_g, min_g, max_g, adjustable, stiffness, optional, note)
           VALUES (?,?,?,?,?,?,?,?,0,1,0,NULL)`,
        )
        .run(recipeId, position++, conceptId, "raw", "base", perPortion, perPortion, perPortion);
    }
    await trx
      .prepare(
        "INSERT INTO recipe_steps (recipe_id, position, text, equipment, timer_seconds, is_prep_ahead, uses_concept_ids) VALUES (?,?,?,?,NULL,0,'[]')",
      )
      .run(recipeId, 1, `Already cooked. Reheat one portion, about ${Math.round(totalG / portions)} g.`, "[]");
    await trx
      .prepare(
        `INSERT INTO free_dishes (id, user_id, recipe_id, title, total_g, portions, portion_g, kcal, protein_g, carb_g, fat_g, fiber_g, ingredients, stock_taken, precision, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        userId,
        recipeId,
        title,
        Math.round(totalG),
        portions,
        Math.round(totalG / portions),
        per(totals.kcal),
        per(totals.protein),
        per(totals.carb),
        per(totals.fat),
        per(totals.fiber),
        JSON.stringify(
          lines.map((l) => ({
            key: l.key,
            label: l.label,
            grams: Math.round(l.grams),
            kcal: Math.round((l.per100.kcal * l.grams) / 100),
            protein: Math.round((l.per100.protein * l.grams) / 100),
          })),
        ),
        input.takeStock ? 1 : 0,
        input.precision ?? null,
        now,
      );

    if (input.takeStock) {
      for (const [conceptId, grams] of gramsByConcept) {
        let remaining = grams;
        const lots = (await trx
          .prepare(
            "SELECT id, quantity_g FROM pantry_items WHERE user_id = ? AND concept_id = ? AND quantity_g > 0 ORDER BY COALESCE(best_before, '9999-12-31')",
          )
          .all(userId, conceptId)) as unknown as { id: string; quantity_g: number }[];
        for (const lot of lots) {
          if (remaining <= 0) break;
          const take = Math.min(lot.quantity_g, remaining);
          await trx.prepare("UPDATE pantry_items SET quantity_g = quantity_g - ?, updated_at = ? WHERE id = ?").run(take, now, lot.id);
          await trx
            .prepare("INSERT INTO inventory_events (item_id, kind, delta_g, reason_ref, at) VALUES (?,?,?,?,?)")
            .run(lot.id, "cook", -take, id, now);
          remaining -= take;
        }
      }
    }
  });

  return { id, kcalPerPortion: per(totals.kcal) };
}

export interface FreeDishRow {
  id: string;
  recipeId: string;
  title: string;
  totalG: number;
  portions: number;
  portionG: number;
  kcal: number;
  protein: number;
  placed: number;
  eaten: number;
  stockTaken: boolean;
  ingredients: { key: string; label: string; grams: number; kcal: number; protein: number }[];
  createdAt: number;
}

export async function listFreeDishes(): Promise<FreeDishRow[]> {
  const rows = (await rawDb()
    .prepare(
      `SELECT d.*,
              (SELECT COUNT(*) FROM meals m JOIN recipe_instances ri ON ri.id = m.recipe_instance_id WHERE ri.recipe_id = d.recipe_id) AS placed,
              (SELECT COUNT(*) FROM meals m JOIN recipe_instances ri ON ri.id = m.recipe_instance_id WHERE ri.recipe_id = d.recipe_id AND m.state = 'cooked') AS eaten
       FROM free_dishes d WHERE d.user_id = ? ORDER BY d.created_at DESC`,
    )
    .all(await currentUserId())) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r["id"]),
    recipeId: String(r["recipe_id"]),
    title: String(r["title"]),
    totalG: Number(r["total_g"]),
    portions: Number(r["portions"]),
    portionG: Number(r["portion_g"]),
    kcal: Number(r["kcal"]),
    protein: Number(r["protein_g"]),
    placed: Number(r["placed"]),
    eaten: Number(r["eaten"]),
    stockTaken: Number(r["stock_taken"]) === 1,
    ingredients: JSON.parse(String(r["ingredients"] ?? "[]")) as FreeDishRow["ingredients"],
    createdAt: Number(r["created_at"]),
  }));
}

async function loadDish(dishId: string): Promise<Record<string, unknown>> {
  const d = (await rawDb().prepare("SELECT * FROM free_dishes WHERE id = ? AND user_id = ?").get(dishId, await currentUserId())) as
    | Record<string, unknown>
    | undefined;
  if (!d) throw new Error("dish not found");
  return d;
}

/**
 * Une portion sur un créneau : remplace le plat prévu, puis le reste de la
 * journée est redosé pour que le total du jour tienne encore.
 */
export async function placePortion(
  dishId: string,
  slotId: string,
  options: { eaten?: boolean; rebalance?: boolean } = {},
): Promise<{ date: string }> {
  const db = rawDb();
  const userId = await currentUserId();
  const d = await loadDish(dishId);
  const slot = (await db
    .prepare(
      `SELECT s.id, s.date, p.week_start, p.seed, m.id AS meal_id, m.state
       FROM meal_slots s JOIN meal_plans p ON p.id = s.plan_id
       LEFT JOIN meals m ON m.slot_id = s.id
       WHERE s.id = ? AND p.user_id = ?`,
    )
    .get(slotId, userId)) as { id: string; date: string; week_start: string; seed: number; meal_id: string | null; state: string | null } | undefined;
  if (!slot) throw new Error("slot not found");
  if (slot.state === "cooked") throw new Error("already cooked");

  const ings = (await db
    .prepare("SELECT concept_id, ref_g FROM recipe_ingredients WHERE recipe_id = ?")
    .all(String(d["recipe_id"]))) as unknown as { concept_id: string; ref_g: number }[];
  const grams = Object.fromEntries(ings.map((i) => [i.concept_id, i.ref_g]));
  const now = Math.floor(Date.now() / 1000);
  const precision = (d["precision"] as string | null) ?? (ings.length === 0 && Number(d["total_g"]) === 0 ? "rough" : "known");

  await db.tx(async (trx) => {
    await trx.prepare("DELETE FROM meals WHERE slot_id = ? AND state != 'cooked'").run(slotId);
    const instId = randomUUID();
    await trx
      .prepare(
        "INSERT INTO recipe_instances (id, recipe_id, user_id, grams, kcal, protein_g, carb_g, fat_g, fiber_g, cost_cents, solver_status, solver_trace, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        instId,
        String(d["recipe_id"]),
        userId,
        JSON.stringify(grams),
        Number(d["kcal"]),
        Number(d["protein_g"]),
        Number(d["carb_g"]),
        Number(d["fat_g"]),
        Number(d["fiber_g"]),
        null,
        "estimate",
        JSON.stringify({ free: dishId }),
        now,
      );
    await trx.prepare("UPDATE recipe_instances SET precision = ? WHERE id = ?").run(precision, instId);
    await trx
      .prepare("INSERT INTO meals (id, slot_id, recipe_instance_id, state, explanation, cooked_at) VALUES (?,?,?,?,?,?)")
      .run(randomUUID(), slotId, instId, options.eaten ? "cooked" : "planned", JSON.stringify({ free: 1 }), options.eaten ? now : null);
  });

  if (options.rebalance !== false) await rebalanceDay(slot.date, slot.week_start, slot.seed);
  return { date: slot.date };
}

export interface EntryInput {
  date: string;
  /** Créneau visé : sinon le premier créneau vide du jour, sinon un créneau en plus. */
  slotId?: string;
  kind: "portion" | "food" | "ballpark" | "composed";
  dishId?: string;
  key?: string;
  grams?: number;
  kcal?: number;
  protein?: number;
  title?: string;
  /** Plat composé (photo) : plusieurs lignes, avec l'état de chacune et la confiance retenue. */
  lines?: { key: string; grams: number; state?: string }[];
  precision?: "known" | "rough";
}

/**
 * « J'ai mangé ça » : une portion de batch, un produit pesé ou une estimation.
 * Ça devient un repas mangé du jour, sur le créneau visé (le plat prévu cède sa
 * place), sinon sur le premier créneau vide, sinon sur un créneau en plus. Le
 * reste de la journée est redosé pour que la cible tienne toujours.
 */
export async function addEntry(input: EntryInput): Promise<{ dishId: string; slotId: string }> {
  const db = rawDb();
  const userId = await currentUserId();
  let dishId = input.dishId ?? "";

  if (input.kind === "food") {
    if (!input.key || !(input.grams && input.grams > 0)) throw new Error("food and grams required");
    const r = await resolveLine(input.key);
    if (!r) throw new Error("unknown food");
    dishId = (
      await createFreeDish({ title: `${r.label} · ${Math.round(input.grams)} g`, portions: 1, lines: [{ key: input.key, grams: input.grams }], takeStock: false })
    ).id;
  } else if (input.kind === "composed") {
    const lines = (input.lines ?? []).filter((l) => l.grams > 0);
    if (lines.length === 0) throw new Error("lines required");
    dishId = (
      await createFreeDish({
        title: input.title?.trim() || "Photo meal",
        portions: 1,
        lines: lines.map((l) => ({ key: l.key, grams: l.grams })),
        states: Object.fromEntries(lines.map((l) => [l.key, l.state ?? "cooked"])),
        takeStock: false,
        precision: input.precision ?? "rough",
      })
    ).id;
  } else if (input.kind === "ballpark") {
    if (!(input.kcal && input.kcal > 0)) throw new Error("kcal required");
    dishId = (
      await createFreeDish({
        title: input.title?.trim() || "Ballpark meal",
        portions: 1,
        lines: [],
        takeStock: false,
        direct: { kcal: input.kcal, protein: input.protein ?? 0 },
      })
    ).id;
  } else {
    const d = await loadDish(dishId);
    const placed = (await db
      .prepare("SELECT COUNT(*) AS n FROM meals m JOIN recipe_instances ri ON ri.id = m.recipe_instance_id WHERE ri.recipe_id = ?")
      .get(String(d["recipe_id"]))) as { n: number };
    if (Number(placed.n) >= Number(d["portions"])) throw new Error("no portion left");
  }

  const slots = (await db
    .prepare(
      `SELECT s.id, s.plan_id, s.slot, m.state, m.skip_reason
       FROM meal_slots s JOIN meal_plans p ON p.id = s.plan_id
       LEFT JOIN meals m ON m.slot_id = s.id
       WHERE p.user_id = ? AND s.date = ?
       ORDER BY CASE s.slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 WHEN 'dinner' THEN 3 ELSE 4 END, s.id`,
    )
    .all(userId, input.date)) as unknown as { id: string; plan_id: string; slot: string; state: string | null; skip_reason: string | null }[];
  if (slots.length === 0) throw new Error("no plan for that day");

  let target = input.slotId ? slots.find((s) => s.id === input.slotId) : undefined;
  if (input.slotId && !target) throw new Error("slot not found");
  if (target?.state === "cooked") throw new Error("already eaten");
  if (!target) target = slots.find((s) => s.state === null);
  if (!target) {
    const extras = slots.filter((s) => s.id.includes(":extra-")).length;
    const id = `${userId}:${input.date}:extra-${extras + 1}`;
    await db
      .prepare(
        "INSERT INTO meal_slots (id, plan_id, date, slot, label, kcal_target, protein_target, max_minutes, portable, locked) VALUES (?,?,?,?,?,0,0,5,1,0)",
      )
      .run(id, slots[0]!.plan_id, input.date, "snack", "Extra");
    target = { id, plan_id: slots[0]!.plan_id, slot: "snack", state: null, skip_reason: null };
  }

  await placePortion(dishId, target.id, { eaten: true });
  return { dishId, slotId: target.id };
}

/**
 * Le jour a un morceau fixe (portion libre, repas déjà cuisinés) : les autres
 * repas encore à faire se partagent ce qui reste de la cible, au prorata.
 */
export async function rebalanceDay(date: string, weekStart: string, seed: number): Promise<number> {
  const db = rawDb();
  const userId = await currentUserId();
  const { ctx } = await buildContext(weekStart, seed);
  const daySlots = ctx.slots.filter((s) => s.date === date);
  if (daySlots.length === 0) return 0;
  const dayTarget = daySlots.reduce((s, x) => s + x.kcalTarget, 0);
  const recipeById = new Map(ctx.recipes.map((r) => [r.id, r]));

  const rows = (await db
    .prepare(
      `SELECT s.id AS slot_id, s.slot, m.id AS meal_id, m.state, ri.recipe_id, ri.kcal
       FROM meal_slots s JOIN meal_plans p ON p.id = s.plan_id
       JOIN meals m ON m.slot_id = s.id JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       WHERE p.user_id = ? AND s.date = ?`,
    )
    .all(userId, date)) as unknown as { slot_id: string; slot: string; meal_id: string; state: string; recipe_id: string; kcal: number }[];

  let fixedKcal = 0;
  const adjustable: { slotId: string; mealId: string; recipeId: string; target: number; proteinTarget: number; slot: string }[] = [];
  for (const r of rows) {
    if (r.state === "skipped" || r.state === "eating_out") continue;
    const recipe = recipeById.get(r.recipe_id);
    const target = daySlots.find((s) => s.id === r.slot_id);
    if (r.state === "cooked" || isFreeRecipe(r.recipe_id) || !recipe || !target) {
      fixedKcal += Number(r.kcal);
      continue;
    }
    adjustable.push({ slotId: r.slot_id, mealId: r.meal_id, recipeId: r.recipe_id, target: target.kcalTarget, proteinTarget: target.proteinTarget, slot: r.slot });
  }
  if (adjustable.length === 0) return 0;

  const remaining = Math.max(0, dayTarget - fixedKcal);
  const targetSum = adjustable.reduce((s, a) => s + a.target, 0) || 1;
  const solver = await loadHighs(join(process.cwd(), "node_modules", "highs", "build"));
  const now = Math.floor(Date.now() / 1000);
  let changed = 0;

  await db.tx(async (trx) => {
    for (const a of adjustable) {
      const want = Math.max(150, Math.round((remaining * a.target) / targetSum));
      const recipe = recipeById.get(a.recipeId)!;
      const ratio = Math.min(1, want / Math.max(1, a.target));
      const solved = solveMeal(solver, recipe.ingredients, {
        kcal: want,
        kcalTolerance: 60,
        proteinMin: Math.round(a.proteinTarget * ratio),
        animalMinG: ctx.mainSlots.has(a.slot as never) ? Math.round(ctx.meatPerMainMealG * ratio) : 0,
      });
      const instId = randomUUID();
      await trx
        .prepare(
          "INSERT INTO recipe_instances (id, recipe_id, user_id, grams, kcal, protein_g, carb_g, fat_g, fiber_g, cost_cents, solver_status, solver_trace, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          instId,
          recipe.id,
          userId,
          JSON.stringify(solved.grams),
          solved.totals.kcal,
          solved.totals.protein,
          solved.totals.carb,
          solved.totals.fat,
          solved.totals.fiber,
          null,
          solved.status,
          JSON.stringify({ rebalanced: 1 }),
          now,
        );
      await trx.prepare("UPDATE meals SET recipe_instance_id = ? WHERE id = ?").run(instId, a.mealId);
      changed++;
    }
  });
  return changed;
}

export interface SlotTarget {
  slotId: string;
  date: string;
  slot: string;
  title: string | null;
  free: boolean;
}

/** Déjeuners et dîners encore ouverts, d'aujourd'hui à la fin de la semaine préparée. */
export async function upcomingMainSlots(): Promise<SlotTarget[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = (await rawDb()
    .prepare(
      `SELECT s.id AS slot_id, s.date, s.slot, m.state, ri.recipe_id, COALESCE(r.title_en, r.title) AS title
       FROM meal_slots s JOIN meal_plans p ON p.id = s.plan_id
       LEFT JOIN meals m ON m.slot_id = s.id
       LEFT JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       LEFT JOIN recipes r ON r.id = ri.recipe_id
       WHERE p.user_id = ? AND s.date >= ? AND s.slot IN ('lunch','dinner')
       ORDER BY s.date, CASE s.slot WHEN 'lunch' THEN 0 ELSE 1 END`,
    )
    .all(await currentUserId(), today)) as unknown as { slot_id: string; date: string; slot: string; state: string | null; recipe_id: string | null; title: string | null }[];
  return rows
    .filter((r) => r.state !== "cooked" && r.state !== "eating_out" && r.state !== "skipped")
    .map((r) => ({ slotId: r.slot_id, date: r.date, slot: r.slot, title: r.title, free: isFreeRecipe(r.recipe_id) }));
}

/** Pose N portions sur les prochains déjeuners et dîners libres, un par créneau. */
export async function spreadPortions(dishId: string, count: number): Promise<number> {
  const targets = (await upcomingMainSlots()).filter((t) => !t.free);
  let placed = 0;
  for (const t of targets.slice(0, count)) {
    await placePortion(dishId, t.slotId);
    placed++;
  }
  return placed;
}

/** Une portion mangée : le repas passe en cuisiné, sans toucher au stock déjà décompté. */
export async function eatPortion(slotId: string): Promise<void> {
  const db = rawDb();
  const row = (await db
    .prepare(
      `SELECT m.id, ri.recipe_id FROM meals m JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       JOIN meal_slots s ON s.id = m.slot_id JOIN meal_plans p ON p.id = s.plan_id
       WHERE m.slot_id = ? AND p.user_id = ?`,
    )
    .get(slotId, await currentUserId())) as { id: string; recipe_id: string } | undefined;
  if (!row || !isFreeRecipe(row.recipe_id)) throw new Error("not a free portion");
  await db.prepare("UPDATE meals SET state = 'cooked', cooked_at = ? WHERE id = ?").run(Math.floor(Date.now() / 1000), row.id);
}

/** Supprimer un plat dont aucune portion posée n'est encore à manger. */
export async function deleteFreeDish(dishId: string): Promise<void> {
  const db = rawDb();
  const d = await loadDish(dishId);
  const open = (await db
    .prepare(
      "SELECT COUNT(*) AS n FROM meals m JOIN recipe_instances ri ON ri.id = m.recipe_instance_id WHERE ri.recipe_id = ? AND m.state != 'cooked'",
    )
    .get(String(d["recipe_id"]))) as { n: number };
  if (Number(open.n) > 0) throw new Error("portions still placed");
  await db.prepare("DELETE FROM free_dishes WHERE id = ?").run(dishId);
}
