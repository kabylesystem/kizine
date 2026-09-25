import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/db/client";
import { hashPassword, issue, verifyPassword, SESSION_COOKIE, SESSION_MAX_AGE } from "@/server/auth";

const schema = z.object({ userId: z.string().max(60).optional(), password: z.string().max(200) });

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "requête invalide" }, { status: 400 });
  const { userId, password } = parsed.data;

  // Réponse volontairement lente : un mot de passe court ne se force pas au fil de l'eau.
  await new Promise((r) => setTimeout(r, 400));

  const db = rawDb();
  const rows = (await db.prepare("SELECT id, password_hash FROM users").all()) as {
    id: string;
    password_hash: string | null;
  }[];

  // Le compte historique n'avait pas d'empreinte : son mot de passe vit dans
  // l'environnement. On la pose à la volée pour ne plus jamais y revenir.
  const legacy = process.env.APP_PASSWORD;
  const match = rows.find((r) => {
    if (userId && r.id !== userId) return false;
    if (verifyPassword(password, r.password_hash)) return true;
    return !r.password_hash && legacy !== undefined && password === legacy;
  });

  if (!match) return NextResponse.json({ error: "wrong" }, { status: 401 });
  if (!match.password_hash && legacy) {
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(legacy), match.id);
  }

  const res = NextResponse.json({ ok: true, userId: match.id });
  res.cookies.set(SESSION_COOKIE, issue(match.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export async function DELETE(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
