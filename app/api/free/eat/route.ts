import { NextResponse } from "next/server";
import { eatPortion } from "@/server/free-dish";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { slotId?: string };
  if (!body.slotId) return NextResponse.json({ error: "slotId requis" }, { status: 400 });
  try {
    await eatPortion(body.slotId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}
