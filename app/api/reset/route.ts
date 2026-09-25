import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/db/client";
import { currentUserId } from "@/server/auth";

const schema = z.object({ confirm: z.literal("RESET") });

/**
 * Remise à zéro de ce qui est PERSONNEL : goûts, plans, stock, pesées, trajets.
 * Le livre de recettes, les aliments et les tables de nutrition restent : ce
 * sont des données de référence, les réimporter prendrait des minutes pour rien.
 *
 * Toutes ces tables portent une colonne user_id. Celles qui n'en ont pas
 * (meals, meal_slots, inventory_events…) descendent d'une de celles-ci et
 * partent en cascade : les effacer sans filtre supprimerait les données de
 * l'autre compte, ce qui est exactement le bug qu'on a corrigé ici.
 */
const PERSONAL = [
  "meal_plans",
  "purchases",
  "pantry_items",
  "pantry_declarations",
  "preferences",
  "cuisine_preferences",
  "dish_ratings",
  "swipe_events",
  "duel_events",
  "fatigue_states",
  "day_overrides",
  "day_profiles",
  "weight_logs",
  "training_sessions",
  "commutes",
  "goals",
  "equipment",
  "receipts",
  "recipe_instances",
  "nutrition_profiles",
];

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "confirmation manquante" }, { status: 400 });
  }
  const db = rawDb();
  const id = await currentUserId();

  try {
    await db.tx(async (trx) => {
      for (const table of PERSONAL) {
        await trx.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id);
      }
      // L'onboarding redevient obligatoire : c'est lui qui reconstruit le profil.
      await trx.prepare("UPDATE users SET onboarded_at = NULL WHERE id = ?").run(id);
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const kept = (await db.prepare("SELECT COUNT(*) AS c FROM recipes").get()) as { c: number } | undefined;
  return NextResponse.json({ ok: true, recipesKept: Number(kept?.c ?? 0) });
}
