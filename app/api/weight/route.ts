import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/db/client";

const schema = z.object({
  kg: z.number().min(30).max(250),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Une pesée. Rien n'est décidé sur une pesée isolée : c'est la moyenne glissante qui parle. */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const date = parsed.data.date ?? new Date().toISOString().slice(0, 10);
  await rawDb()
    .prepare("INSERT OR REPLACE INTO weight_logs (user_id, date, kg, note) VALUES (?,?,?,?)")
    .run((await currentUserId()), date, parsed.data.kg, null);
  return NextResponse.json({ ok: true, date, kg: parsed.data.kg });
}
