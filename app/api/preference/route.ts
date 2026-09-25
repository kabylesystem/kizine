import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/db/client";
import { replanSlots, slotsUsing } from "@/server/replan-service";

const schema = z.object({
  conceptId: z.string(),
  action: z.enum(["never", "limit", "reset"]),
  perWeek: z.number().min(0).max(14).optional(),
});

const SCORE = { never: -1, limit: 0.35, reset: 0 } as const;

/** Bannir ou limiter un aliment. « never » est une contrainte dure, pas une préférence molle. */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { conceptId, action, perWeek } = parsed.data;
  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);

  const exists = await db.prepare("SELECT id FROM food_concepts WHERE id = ?").get(conceptId);
  if (!exists) return NextResponse.json({ error: "aliment inconnu" }, { status: 404 });

  if (action === "reset") {
    await db.prepare("DELETE FROM preferences WHERE user_id = ? AND concept_id = ?").run((await currentUserId()), conceptId);
  } else {
    await db.prepare(
      `INSERT INTO preferences (user_id, concept_id, affinity, affinity_score, elo, frequency_per_week, revealed_score, exposures, stated_at, updated_at)
       VALUES (?,?,?,?,NULL,?,NULL,0,?,?)
       ON CONFLICT(user_id, concept_id) DO UPDATE SET
         affinity = excluded.affinity,
         affinity_score = excluded.affinity_score,
         frequency_per_week = excluded.frequency_per_week,
         updated_at = excluded.updated_at`,
    ).run(
      (await currentUserId()),
      conceptId,
      action === "never" ? "never" : "like",
      SCORE[action],
      action === "limit" ? (perWeek ?? 1) : null,
      now,
      now,
    );
  }

  await db.prepare(
    "INSERT INTO swipe_events (user_id, subject_type, subject_id, verdict, ms, round, at) VALUES (?,?,?,?,?,?,?)",
  ).run((await currentUserId()), "concept", conceptId, action, null, "quick", now);

  // Bannir sans replanifier ne servait à rien : le plat restait dans la semaine
  // et l'aliment restait sur la liste de courses.
  let rescheduled = 0;
  if (action === "never") {
    const affected = await slotsUsing(conceptId);
    if (affected.length > 0) rescheduled = await replanSlots(affected);
  }

  return NextResponse.json({ ok: true, conceptId, action, rescheduled });
}
