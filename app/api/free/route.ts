import { NextResponse } from "next/server";
import { z } from "zod";
import { createFreeDish, deleteFreeDish } from "@/server/free-dish";

const schema = z.object({
  title: z.string().min(1).max(80),
  portions: z.number().int().min(1).max(30),
  lines: z.array(z.object({ key: z.string().min(3).max(80), grams: z.number().min(0).max(20000) })).min(1).max(40),
  takeStock: z.boolean().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try {
    const dish = await createFreeDish({ ...parsed.data, takeStock: parsed.data.takeStock ?? true });
    return NextResponse.json({ ok: true, ...dish });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { dishId?: string };
  if (!body.dishId) return NextResponse.json({ error: "dishId requis" }, { status: 400 });
  try {
    await deleteFreeDish(body.dishId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === "portions still placed" ? 409 : 500 });
  }
}
