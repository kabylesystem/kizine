import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAndStorePlan, currentWeek } from "@/server/plan-service";

const schema = z.object({ weekStart: z.string().optional(), seed: z.number().int().optional() });

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  const weekStart = parsed.success && parsed.data.weekStart ? parsed.data.weekStart : await currentWeek();
  const seed = parsed.success && parsed.data.seed !== undefined ? parsed.data.seed : Math.floor(Math.random() * 1e9);
  try {
    const planId = await generateAndStorePlan(weekStart, seed);
    return NextResponse.json({ ok: true, planId, weekStart, seed });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
