import { NextResponse } from "next/server";
import { rawDb } from "@/db/client";
import { currentUserId } from "@/server/auth";

/** Marque l'écran d'accueil comme lu. Il reste consultable ensuite. */
export async function POST(): Promise<NextResponse> {
  await rawDb()
    .prepare("UPDATE users SET welcomed_at = ? WHERE id = ?")
    .run(Math.floor(Date.now() / 1000), await currentUserId());
  return NextResponse.json({ ok: true });
}
