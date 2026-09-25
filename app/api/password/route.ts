import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/db/client";
import { currentUserId, hashPassword, verifyPassword } from "@/server/auth";

const schema = z.object({ current: z.string().max(200), next: z.string().min(4).max(200) });

/** Changer son mot de passe. L'ancien est exigé : un cookie volé ne suffit pas. */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const id = await currentUserId();
  const db = rawDb();
  const row = (await db.prepare("SELECT password_hash FROM users WHERE id = ?").get(id)) as
    | { password_hash: string | null }
    | undefined;

  const legacy = process.env.APP_PASSWORD;
  const ok =
    verifyPassword(parsed.data.current, row?.password_hash ?? null) ||
    (!row?.password_hash && legacy !== undefined && parsed.data.current === legacy);
  if (!ok) return NextResponse.json({ error: "wrong" }, { status: 401 });

  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(parsed.data.next), id);
  return NextResponse.json({ ok: true });
}
