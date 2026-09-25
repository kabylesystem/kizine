import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUserId } from "@/server/auth";

/**
 * Un ticket de cinq minutes pour parler directement au service photo de la box :
 * le navigateur envoie l'image là-bas, pas ici, donc aucune limite de durée Vercel.
 */
export async function GET(): Promise<NextResponse> {
  await currentUserId();
  const url = process.env.KIZIN_VISION_URL;
  const key = process.env.KIZIN_VISION_KEY;
  if (!url || !key) return NextResponse.json({ error: "photo athe usersis not configured" }, { status: 503 });
  const exp = String(Math.floor(Date.now() / 1000) + 300);
  const sig = createHmac("sha256", key).update(exp).digest("hex");
  return NextResponse.json({ url: `${url.replace(/\/$/, "")}/vision`, token: `${exp}.${sig}` });
}
