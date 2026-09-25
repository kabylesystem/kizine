import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/db/client";

const schema = z.object({
  /** Un plat entier : approuver « poulet mafé » vaut pour ses deux soirs. */
  recipeId: z.string().optional(),
  /** Ou un créneau précis, pour marquer un repas dehors un jour donné. */
  slotId: z.string().optional(),
  action: z.enum(["yes", "out", "undo"]),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const STATE = { yes: "approved", out: "eating_out", undo: "planned" } as const;

/**
 * Validation avant les courses. On raisonne en PLATS, pas en créneaux : une
 * semaine de 28 repas ne contient qu'une quinzaine de plats distincts, et
 * personne n'a envie de cliquer 28 fois pour dire la même chose cinq fois.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { recipeId, slotId, action, weekStart } = parsed.data;
  if (!recipeId && !slotId) return NextResponse.json({ error: "plat ou créneau requis" }, { status: 400 });

  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);
  const state = STATE[action];
  const approvedAt = action === "undo" ? null : now;

  const targets = slotId
    ? (await db.prepare("SELECT id FROM meals WHERE slot_id = ? AND state != 'cooked'").all(slotId) as unknown as {
        id: string;
      }[])
    : (await db
        .prepare(
          `SELECT m.id FROM meals m
           JOIN meal_slots s ON s.id = m.slot_id
           JOIN meal_plans p ON p.id = s.plan_id
           JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
           WHERE p.user_id = ? AND p.week_start = ? AND ri.recipe_id = ? AND m.state != 'cooked'`,
        )
        .all((await currentUserId()), weekStart, recipeId as string) as unknown as { id: string }[]);

  if (targets.length === 0) return NextResponse.json({ error: "rien à changer" }, { status: 404 });

  try {
    await db.tx(async (trx) => {
      const stmt = trx.prepare("UPDATE meals SET state = ?, approved_at = ? WHERE id = ?");
      for (const t of targets) await stmt.run(state, approvedAt, t.id);
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, changed: targets.length, action });
}

/** Combien de fois il compte manger dehors cette semaine. */
export async function PUT(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { mealsOut?: number };
  const n = Number(body.mealsOut);
  if (!Number.isInteger(n) || n < 0 || n > 14) {
    return NextResponse.json({ error: "hors bornes" }, { status: 400 });
  }
  await rawDb()
    .prepare("UPDATE goals SET meals_out_per_week = ?, updated_at = ? WHERE user_id = ?")
    .run(n, Math.floor(Date.now() / 1000), (await currentUserId()));
  return NextResponse.json({ ok: true, mealsOut: n });
}
