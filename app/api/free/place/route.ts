import { NextResponse } from "next/server";
import { z } from "zod";
import { placePortion, spreadPortions } from "@/server/free-dish";

const schema = z.object({
  dishId: z.string().min(1),
  slotId: z.string().optional(),
  count: z.number().int().min(1).max(14).optional(),
});

/** Une portion sur un créneau précis, ou N portions étalées sur les prochains repas. */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { dishId, slotId, count } = parsed.data;
  try {
    if (slotId) {
      const r = await placePortion(dishId, slotId);
      return NextResponse.json({ ok: true, placed: 1, date: r.date });
    }
    const placed = await spreadPortions(dishId, count ?? 1);
    return NextResponse.json({ ok: true, placed });
  } catch (err) {
    const msg = (err as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === "already cooked" ? 409 : msg.includes("not found") ? 404 : 500 });
  }
}
