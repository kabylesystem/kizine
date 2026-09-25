import { NextResponse } from "next/server";
import { rawDb } from "@/db/client";
import { currentUserId } from "@/server/auth";
import { CURRENT_RELEASE } from "@/data/releases";

export async function POST(): Promise<NextResponse> {
  await rawDb().prepare("UPDATE users SET seen_release = ? WHERE id = ?").run(CURRENT_RELEASE, await currentUserId());
  return NextResponse.json({ ok: true });
}

/** Relire la note : on oublie qu'elle a été vue, Today la remontre. */
export async function DELETE(): Promise<NextResponse> {
  await rawDb().prepare("UPDATE users SET seen_release = NULL WHERE id = ?").run(await currentUserId());
  return NextResponse.json({ ok: true });
}
