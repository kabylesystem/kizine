import { NextResponse } from "next/server";
import { searchIngredients } from "@/server/free-dish";
import { getLang } from "@/server/lang";

export async function GET(request: Request): Promise<NextResponse> {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const hits = await searchIngredients(q, await getLang());
  return NextResponse.json({ hits });
}
