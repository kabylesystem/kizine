import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/db/client";
import { loadNutrition, nutritionFor } from "@/db/repo";
import { getLang } from "@/server/lang";

const schema = z.object({
  dish: z.string().max(80).optional(),
  totalG: z.number().min(10).max(5000),
  weighed: z.boolean(),
  items: z.array(z.object({ id: z.string(), share: z.number().min(0).max(1), state: z.enum(["raw", "cooked"]).optional() })).min(1).max(30),
});

/** Rendement raw→cooked quand la base n'a pas de valeur « cuit » pour l'aliment. */
const FALLBACK_YIELD: Record<string, number> = { protein: 0.75, vegetable: 0.9, carb: 2.4, fruit: 1, dairy: 1, fat: 1, sauce: 1, spice: 1, staple: 1 };

/**
 * La photo a donné des parts de l'assiette servie ; ici la base fait les
 * calories. « Cuit » quand on a la valeur cuite, sinon on repasse au cru avec
 * le rendement de cuisson. Rien n'est inventé par le modèle côté chiffres.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { dish, totalG, weighed, items } = parsed.data;
  const lang = await getLang();
  const db = rawDb();
  const ids = [...new Set(items.map((i) => i.id))];
  const placeholders = ids.map(() => "?").join(",");
  const [index, concepts, yields] = await Promise.all([
    loadNutrition(),
    db.prepare(`SELECT id, name_en, name_fr, category FROM food_concepts WHERE id IN (${placeholders})`).all(...ids) as unknown as Promise<
      { id: string; name_en: string; name_fr: string; category: string }[]
    >,
    db.prepare("SELECT concept_id, from_state, to_state, weight_factor FROM yield_factors").all() as unknown as Promise<
      { concept_id: string; from_state: string; to_state: string; weight_factor: number }[]
    >,
  ]);
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const yieldOf = (id: string) => yields.find((y) => y.concept_id === id && y.to_state === "cooked")?.weight_factor ?? null;

  const lines = [];
  for (const it of items) {
    const c = byId.get(it.id);
    if (!c) continue;
    const servedG = Math.round(totalG * it.share);
    const state = it.state ?? "cooked";
    let per100 = state === "cooked" ? index.byConceptState.get(`${it.id}:cooked`) ?? null : null;
    let grams = servedG;
    let usedState = "cooked";
    if (!per100) {
      per100 = nutritionFor(index, it.id, "raw");
      usedState = index.byConceptState.has(`${it.id}:raw`) ? "raw" : "dry";
      if (!per100) continue;
      if (state === "cooked") {
        const factor = yieldOf(it.id) ?? FALLBACK_YIELD[c.category] ?? 1;
        grams = Math.round(servedG / factor);
      }
    }
    lines.push({
      key: `c:${it.id}`,
      label: lang === "fr" ? c.name_fr : c.name_en,
      servedG,
      grams,
      state: usedState,
      kcal: Math.round((per100.kcal * grams) / 100),
      protein: Math.round((per100.protein * grams) / 100),
    });
  }
  const kcal = lines.reduce((s, l) => s + l.kcal, 0);
  const protein = lines.reduce((s, l) => s + l.protein, 0);
  return NextResponse.json({
    title: dish ?? "Photo meal",
    lines,
    kcal,
    protein,
    totalG,
    precision: weighed ? "known" : "rough",
  });
}
