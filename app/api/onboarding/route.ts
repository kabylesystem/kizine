import { currentUserId } from "@/server/auth";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { migrate, rawDb } from "@/db/client";
import { generateAndStorePlan, currentWeek } from "@/server/plan-service";
import { fatFloor } from "@/core/energy";

const schema = z.object({
  verdicts: z.record(z.string(), z.enum(["love", "like", "meh", "never"])),
  elo: z.record(z.string(), z.number()),
  duels: z.array(z.object({ left: z.string(), right: z.string(), winner: z.string() })),
  frequency: z.record(z.string(), z.number()),
  days: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      label: z.string(),
      context: z.enum(["home", "school", "away", "flexible"]),
      meals: z.number().int().min(2).max(4),
      cookMinutes: z.number().int().min(0).max(180),
    }),
  ),
  body: z.object({
    weightKg: z.number(),
    heightCm: z.number(),
    ageYears: z.number(),
    sex: z.enum(["m", "f"]),
    activityFactor: z.number(),
    goalKind: z.enum(["bulk", "bulkFast", "maintain", "cut"]),
    kgPerWeek: z.number().min(-1.5).max(1.5),
    proteinPerKg: z.number(),
    kcalTarget: z.number(),
    proteinTarget: z.number(),
  }),
  energy: z
    .object({
      dailyLife: z.enum(["seated", "mixed", "onFeet", "physical"]),
      sessions: z.array(
        z.object({
          sportId: z.string(),
          perWeek: z.number().int().min(1).max(14),
          blockMinutes: z.record(z.string(), z.number()).optional(),
        }),
      ),
      commutes: z.array(
        z.object({
          label: z.string().max(60),
          from: z.string().max(200).optional(),
          to: z.string().max(200).optional(),
          km: z.number().min(0.1).max(300),
          mode: z.enum(["walk", "bike", "ebike", "transit", "scooter", "car"]),
          tripsPerWeek: z.number().int().min(1).max(21),
        }),
      ),
      maintenanceKcal: z.number(),
    })
    .optional(),
  kitchen: z.object({
    equipment: z.array(z.string()),
    spiceTolerance: z.number().int().min(0).max(4),
    maxPans: z.number().int().min(1).max(4),
    shoppingWeekday: z.number().int().min(0).max(6),
    weeklyBudgetEur: z.number().nullable(),
    leftoverTolerance: z.number().int().min(0).max(3),
  }),
});

const AFFINITY_SCORE = { love: 1, like: 0.35, meh: -0.35, never: -1 } as const;

/**
 * Répartition des calories selon le nombre de repas et le contexte du jour.
 * Le matin pèse peu : default-user n'a pas faim au réveil.
 */
function mealSlotsFor(meals: number, context: string, cookMinutes: number) {
  // « flexible » = on ne sait pas encore : on prévoit transportable, quitte à
  // rebasculer le jour même depuis l'écran Today.
  const portable = context !== "home";
  const dinnerMinutes = Math.max(10, cookMinutes);
  const middayMinutes = portable ? 0 : Math.max(10, Math.round(cookMinutes * 0.7));

  if (meals === 2) {
    return [
      { slot: "lunch", label: portable ? "Packed lunch" : "First meal", kcalShare: 0.44, proteinShare: 0.44, portable, maxMinutes: middayMinutes },
      { slot: "snack", label: "Loader", kcalShare: 0.14, proteinShare: 0.12, portable: true, maxMinutes: 5 },
      { slot: "dinner", label: "Dinner", kcalShare: 0.42, proteinShare: 0.44, portable: false, maxMinutes: dinnerMinutes },
    ];
  }
  if (meals === 3) {
    return [
      { slot: "breakfast", label: "Morning fuel", kcalShare: 0.15, proteinShare: 0.16, portable, maxMinutes: portable ? 6 : 12 },
      { slot: "lunch", label: portable ? "Packed lunch" : "Lunch", kcalShare: 0.33, proteinShare: 0.33, portable, maxMinutes: middayMinutes },
      { slot: "snack", label: "Afternoon", kcalShare: 0.14, proteinShare: 0.12, portable: true, maxMinutes: 5 },
      { slot: "dinner", label: "Dinner", kcalShare: 0.38, proteinShare: 0.39, portable: false, maxMinutes: dinnerMinutes },
    ];
  }
  return [
    { slot: "breakfast", label: "Morning fuel", kcalShare: 0.17, proteinShare: 0.18, portable, maxMinutes: portable ? 6 : 14 },
    { slot: "lunch", label: portable ? "Packed lunch" : "Lunch", kcalShare: 0.3, proteinShare: 0.3, portable, maxMinutes: middayMinutes },
    { slot: "snack", label: "Afternoon", kcalShare: 0.17, proteinShare: 0.15, portable: true, maxMinutes: 6 },
    { slot: "dinner", label: "Dinner", kcalShare: 0.36, proteinShare: 0.37, portable: false, maxMinutes: dinnerMinutes },
  ];
}

export async function POST(request: Request): Promise<NextResponse> {
  await migrate();
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;
  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);

  try {
    await db.tx(async (trx) => {
      // Surtout PAS de INSERT OR REPLACE ici : la ligne porte aussi le mot de
      // passe, le nom affiché et l'accueil déjà lu. La remplacer en entier les
      // effaçait, et le compte devenait inaccessible.
      await trx
        .prepare(
          `INSERT INTO users (id, name, created_at, onboarded_at) VALUES (?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET onboarded_at = excluded.onboarded_at`,
        )
        .run(await currentUserId(), await currentUserId(), now, now);

      const structure = data.days.map((d) => ({ weekday: d.weekday, meals: d.meals }));
      await trx.prepare(
        `INSERT OR REPLACE INTO nutrition_profiles
          (user_id, kcal_target, protein_target_g, fat_min_g, fiber_min_g, daily_tolerance_kcal, weekly_mode,
           meal_structure, weekly_budget_eur, cook_minutes_weekday, cook_minutes_weekend, max_pans, spice_tolerance,
           leftover_tolerance, bulk_buying_ok, freezer_liters, shopping_weekday, second_shopping_weekday,
           body_weight_kg, height_cm, protein_per_kg, meat_per_main_meal_g, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        (await currentUserId()),
        data.body.kcalTarget,
        data.body.proteinTarget,
        fatFloor(data.body.kcalTarget),
        35,
        150,
        1,
        JSON.stringify(structure),
        data.kitchen.weeklyBudgetEur,
        Math.round(data.days.filter((d) => d.weekday >= 1 && d.weekday <= 5).reduce((s, d) => s + d.cookMinutes, 0) / 5) || 35,
        Math.round(data.days.filter((d) => d.weekday === 0 || d.weekday === 6).reduce((s, d) => s + d.cookMinutes, 0) / 2) || 55,
        data.kitchen.maxPans,
        data.kitchen.spiceTolerance,
        data.kitchen.leftoverTolerance,
        1,
        60,
        data.kitchen.shoppingWeekday,
        null,
        data.body.weightKg,
        data.body.heightCm,
        data.body.proteinPerKg,
        // Aucune règle de viande imposée par défaut : « 300 g par repas principal »
        // est la contrainte de default-user, pas une vérité pour tout le monde.
        // Un compte neuf hérite de 0, et le règle dans les paramètres s'il veut.
        0,
        now,
      );

      await trx.prepare("UPDATE nutrition_profiles SET sex = ?, goal_kind = ?, age_years = ? WHERE user_id = ?").run(
        data.body.sex,
        data.body.goalKind,
        data.body.ageYears,
        await currentUserId(),
      );

      // L'objectif vit dans sa propre table : sans cette ligne, Numbers ne
      // pouvait rien enregistrer et restait figé sur une prise de poids.
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 90 * 86400000);
      const targetKg = Math.round((data.body.weightKg + data.body.kgPerWeek * (90 / 7)) * 2) / 2;
      await trx
        .prepare(
          `INSERT INTO goals (user_id, start_date, end_date, start_kg, target_kg, target_gain_kg_per_week, training_days_per_week, aggressiveness, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(user_id) DO UPDATE SET
             start_date = excluded.start_date, end_date = excluded.end_date, start_kg = excluded.start_kg,
             target_kg = excluded.target_kg, target_gain_kg_per_week = excluded.target_gain_kg_per_week,
             training_days_per_week = excluded.training_days_per_week, aggressiveness = excluded.aggressiveness,
             updated_at = excluded.updated_at`,
        )
        .run(
          await currentUserId(),
          startDate.toISOString().slice(0, 10),
          endDate.toISOString().slice(0, 10),
          data.body.weightKg,
          targetKg,
          data.body.kgPerWeek,
          Math.min(7, data.energy?.sessions.reduce((s, x) => s + x.perWeek, 0) ?? 7) || 7,
          Math.abs(data.body.kgPerWeek) >= 0.6 ? "aggressive" : "steady",
          now,
        );

      await trx.prepare("DELETE FROM day_profiles WHERE user_id = ?").run((await currentUserId()));
      const dayStmt = trx.prepare(
        "INSERT INTO day_profiles (user_id, weekday, label, context, cook_minutes_evening, cook_minutes_midday, meal_slots, training_time, notes) VALUES (?,?,?,?,?,?,?,?,?)",
      );
      for (const d of data.days) {
        const slots = mealSlotsFor(d.meals, d.context, d.cookMinutes);
        await dayStmt.run(
          (await currentUserId()),
          d.weekday,
          d.label,
          d.context,
          d.cookMinutes,
          d.context === "home" ? Math.round(d.cookMinutes * 0.7) : 0,
          JSON.stringify(slots),
          null,
          null,
        );
      }

      await trx.prepare("DELETE FROM equipment WHERE user_id = ?").run((await currentUserId()));
      const eqStmt = trx.prepare("INSERT INTO equipment (user_id, kind, present, notes) VALUES (?,?,?,?)");
      for (const kind of data.kitchen.equipment) await eqStmt.run((await currentUserId()), kind, 1, null);

      // Sport, trajets, vie quotidienne : ce qui rend la cible calorique honnête.
      if (data.energy) {
        await trx.prepare("UPDATE nutrition_profiles SET daily_life = ?, age_years = ? WHERE user_id = ?").run(
          data.energy.dailyLife,
          data.body.ageYears,
          (await currentUserId()),
        );
        await trx.prepare("DELETE FROM training_sessions WHERE user_id = ?").run((await currentUserId()));
        const sessionStmt = trx.prepare(
          "INSERT INTO training_sessions (user_id, sport_id, per_week, minutes, block_minutes, updated_at) VALUES (?,?,?,?,?,?)",
        );
        for (const s of data.energy.sessions) {
          const total = Object.values(s.blockMinutes ?? {}).reduce((a, b) => a + b, 0);
          await sessionStmt.run((await currentUserId()), s.sportId, s.perWeek, Math.round(total), JSON.stringify(s.blockMinutes ?? {}), now);
        }
        await trx.prepare("DELETE FROM commutes WHERE user_id = ?").run((await currentUserId()));
        const commuteStmt = trx.prepare(
          "INSERT INTO commutes (id, user_id, label, from_address, to_address, km, mode, trips_per_week, minutes_one_way, updated_at) VALUES (?,?,?,?,?,?,?,?,NULL,?)",
        );
        for (const c of data.energy.commutes) {
          await commuteStmt.run(randomUUID(), (await currentUserId()), c.label, c.from ?? null, c.to ?? null, c.km, c.mode, c.tripsPerWeek, now);
        }
      }

      await trx.prepare("DELETE FROM preferences WHERE user_id = ?").run((await currentUserId()));
      const prefStmt = trx.prepare(
        "INSERT INTO preferences (user_id, concept_id, affinity, affinity_score, elo, frequency_per_week, revealed_score, exposures, stated_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      );
      const known = new Set(
        (await trx.prepare("SELECT id FROM food_concepts").all() as unknown as { id: string }[]).map((r) => r.id),
      );
      for (const [conceptId, verdict] of Object.entries(data.verdicts)) {
        if (!known.has(conceptId)) continue;
        await prefStmt.run(
          (await currentUserId()),
          conceptId,
          verdict,
          AFFINITY_SCORE[verdict],
          null,
          data.frequency[conceptId] ?? null,
          null,
          0,
          now,
          now,
        );
      }

      await trx.prepare("DELETE FROM dish_ratings WHERE user_id = ?").run((await currentUserId()));
      const dishStmt = trx.prepare(
        "INSERT INTO dish_ratings (user_id, recipe_id, elo, duels, stated, revealed, cooked_count, skipped_count, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      );
      const duelCount = new Map<string, number>();
      for (const d of data.duels) {
        duelCount.set(d.left, (duelCount.get(d.left) ?? 0) + 1);
        duelCount.set(d.right, (duelCount.get(d.right) ?? 0) + 1);
      }
      for (const [recipeId, elo] of Object.entries(data.elo)) {
        await dishStmt.run((await currentUserId()), recipeId, elo, duelCount.get(recipeId) ?? 0, null, null, 0, 0, now);
      }

      const duelStmt = trx.prepare(
        "INSERT INTO duel_events (user_id, left_id, right_id, winner_id, ms, at) VALUES (?,?,?,?,?,?)",
      );
      for (const d of data.duels) await duelStmt.run((await currentUserId()), d.left, d.right, d.winner, null, now);

      const swipeStmt = trx.prepare(
        "INSERT INTO swipe_events (user_id, subject_type, subject_id, verdict, ms, round, at) VALUES (?,?,?,?,?,?,?)",
      );
      for (const [conceptId, verdict] of Object.entries(data.verdicts)) {
        await swipeStmt.run((await currentUserId()), "concept", conceptId, verdict, null, "triage", now);
      }

      for (const kind of ["pantry", "fridge", "freezer"]) {
        await trx.prepare(
          "INSERT OR REPLACE INTO storage_locations (id, user_id, kind, label, capacity_liters) VALUES (?,?,?,?,?)",
        ).run(`${(await currentUserId())}:${kind}`, (await currentUserId()), kind, kind, kind === "freezer" ? 60 : null);
      }
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const weekStart = await currentWeek();
  const planId = await generateAndStorePlan(weekStart);
  return NextResponse.json({ ok: true, planId, weekStart });
}
