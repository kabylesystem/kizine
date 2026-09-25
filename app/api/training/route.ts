import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/db/client";
import { sportById } from "@/core/training";

const schema = z.object({
  sessions: z
    .array(
      z.object({
        sportId: z.string(),
        perWeek: z.number().int().min(0).max(14),
        blockMinutes: z.record(z.string(), z.number().min(0).max(300)).optional(),
      }),
    )
    .max(20),
  dailyLife: z.enum(["seated", "mixed", "onFeet", "physical"]).optional(),
  bodyFatPct: z.number().min(3).max(60).nullable().optional(),
  goalKind: z.enum(["bulk", "bulkFast", "maintain", "cut"]).optional(),
  sex: z.enum(["m", "f"]).optional(),
  targetKg: z.number().min(35).max(200).optional(),
  breakfastDays: z.number().int().min(0).max(7).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  kgPerWeek: z.number().min(-1.5).max(1.5).optional(),
});

/** Enregistre les séances et le contexte de vie. Ne change JAMAIS la cible tout seul. */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);
  const sessions = parsed.data.sessions.filter((s) => sportById(s.sportId) && s.perWeek > 0);

  try {
    await db.tx(async (trx) => {
      await trx.prepare("DELETE FROM training_sessions WHERE user_id = ?").run((await currentUserId()));
      const ins = trx.prepare(
        "INSERT INTO training_sessions (user_id, sport_id, per_week, minutes, block_minutes, updated_at) VALUES (?,?,?,?,?,?)",
      );
      for (const s of sessions) {
        const total = Object.values(s.blockMinutes ?? {}).reduce((a, b) => a + b, 0);
        await ins.run((await currentUserId()), s.sportId, s.perWeek, Math.round(total), JSON.stringify(s.blockMinutes ?? {}), now);
      }
      for (const [col, value] of [
        ["daily_life", parsed.data.dailyLife],
        ["goal_kind", parsed.data.goalKind],
        ["sex", parsed.data.sex],
      ] as const) {
        if (value !== undefined) {
          await trx.prepare(`UPDATE nutrition_profiles SET ${col} = ?, updated_at = ? WHERE user_id = ?`).run(value, now, (await currentUserId()));
        }
      }
      if (parsed.data.weekStartsOn !== undefined) {
      await trx.prepare("UPDATE nutrition_profiles SET week_starts_on = ?, updated_at = ? WHERE user_id = ?").run(
        parsed.data.weekStartsOn,
        now,
        (await currentUserId()),
      );
    }
    if (parsed.data.breakfastDays !== undefined) {
        await trx.prepare(
          "UPDATE nutrition_profiles SET breakfast_days_per_week = ?, updated_at = ? WHERE user_id = ?",
        ).run(parsed.data.breakfastDays, now, (await currentUserId()));
      }
      if (parsed.data.bodyFatPct !== undefined) {
        await trx.prepare("UPDATE nutrition_profiles SET body_fat_pct = ?, updated_at = ? WHERE user_id = ?").run(
          parsed.data.bodyFatPct,
          now,
          (await currentUserId()),
        );
      }
      // Le poids visé et la vitesse vivent avec l'objectif, pas avec le profil.
      if (parsed.data.targetKg !== undefined || parsed.data.kgPerWeek !== undefined) {
        const exists = await trx.prepare("SELECT user_id FROM goals WHERE user_id = ?").get((await currentUserId()));
        if (!exists) {
          // Un compte passé par l'ancien onboarding n'a pas de ligne d'objectif :
          // on la crée ici, sinon rien de ce qu'il règle n'est gardé.
          const prof = (await trx
            .prepare("SELECT body_weight_kg FROM nutrition_profiles WHERE user_id = ?")
            .get(await currentUserId())) as { body_weight_kg: number | null } | undefined;
          const startKg = Number(prof?.body_weight_kg ?? parsed.data.targetKg ?? 70);
          const start = new Date();
          const end = new Date(start.getTime() + 90 * 86400000);
          await trx
            .prepare(
              `INSERT INTO goals (user_id, start_date, end_date, start_kg, target_kg, target_gain_kg_per_week, training_days_per_week, aggressiveness, updated_at)
               VALUES (?,?,?,?,?,?,7,'steady',?)`,
            )
            .run(
              await currentUserId(),
              start.toISOString().slice(0, 10),
              end.toISOString().slice(0, 10),
              startKg,
              parsed.data.targetKg ?? startKg,
              parsed.data.kgPerWeek ?? 0,
              now,
            );
        } else {
          if (parsed.data.targetKg !== undefined) {
            await trx.prepare("UPDATE goals SET target_kg = ?, updated_at = ? WHERE user_id = ?").run(
              parsed.data.targetKg,
              now,
              (await currentUserId()),
            );
          }
          if (parsed.data.kgPerWeek !== undefined) {
            await trx.prepare("UPDATE goals SET target_gain_kg_per_week = ?, updated_at = ? WHERE user_id = ?").run(
              parsed.data.kgPerWeek,
              now,
              (await currentUserId()),
            );
          }
        }
      }
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: sessions.length });
}

/** Applique la cible calculée. Séparé du calcul : rien ne bouge sans un clic. */
export async function PUT(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { kcalTarget?: number; proteinG?: number };
  const kcal = Number(body.kcalTarget);
  if (!Number.isFinite(kcal) || kcal < 1200 || kcal > 7000) {
    return NextResponse.json({ error: "cible hors bornes" }, { status: 400 });
  }
  const protein = Number(body.proteinG);
  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);
  await db.prepare("UPDATE nutrition_profiles SET kcal_target = ?, updated_at = ? WHERE user_id = ?").run(
    Math.round(kcal),
    now,
    (await currentUserId()),
  );
  if (Number.isFinite(protein) && protein > 40 && protein < 400) {
    await db.prepare("UPDATE nutrition_profiles SET protein_target_g = ? WHERE user_id = ?").run(Math.round(protein), (await currentUserId()));
  }
  return NextResponse.json({ ok: true, kcalTarget: Math.round(kcal) });
}
