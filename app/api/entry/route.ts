import { NextResponse } from "next/server";
import { z } from "zod";
import { addEntry } from "@/server/free-dish";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotId: z.string().optional(),
  kind: z.enum(["portion", "food", "ballpark", "composed"]),
  lines: z.array(z.object({ key: z.string().min(3).max(80), grams: z.number().min(0).max(5000), state: z.enum(["raw", "cooked"]).optional() })).max(30).optional(),
  precision: z.enum(["known", "rough"]).optional(),
  dishId: z.string().optional(),
  key: z.string().optional(),
  grams: z.number().min(1).max(5000).optional(),
  kcal: z.number().min(1).max(5000).optional(),
  protein: z.number().min(0).max(400).optional(),
  title: z.string().max(80).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try {
    const r = await addEntry(parsed.data);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const msg = (err as Error).message;
    return NextResponse.json({ error: msg }, { status: msg.includes("required") || msg.includes("left") ? 400 : 500 });
  }
}
