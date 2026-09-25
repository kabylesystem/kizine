import { currentUserId } from "@/server/auth";
import { rawDb } from "@/db/client";


export interface Blocker {
  conceptId: string;
  name: string;
  blocked: number;
  share: number;
}

/**
 * Un « jamais » posé sur une base (huile, riz, pâtes) supprime la moitié du
 * livre de recettes. Avant, la semaine se réduisait en silence à deux repas
 * par jour ; maintenant on nomme le coupable et on propose de l'annuler.
 */
export async function banBlockers(lang: "en" | "fr" = "en"): Promise<Blocker[]> {
  const db = rawDb();
  const total = (await db.prepare("SELECT COUNT(*) AS c FROM recipes WHERE enabled = 1").get()) as
    | { c: number }
    | undefined;
  const totalRecipes = Number(total?.c ?? 0) || 1;

  const rows = (await db
    .prepare(
      `SELECT p.concept_id AS id,
              ${lang === "fr" ? "c.name_fr" : "c.name_en"} AS name,
              (SELECT COUNT(DISTINCT ri.recipe_id) FROM recipe_ingredients ri
               JOIN recipes r ON r.id = ri.recipe_id
               WHERE ri.concept_id = p.concept_id AND ri.optional = 0 AND r.enabled = 1) AS blocked
       FROM preferences p JOIN food_concepts c ON c.id = p.concept_id
       WHERE p.user_id = ? AND p.affinity = 'never'
       ORDER BY blocked DESC`,
    )
    .all((await currentUserId()))) as { id: string; name: string; blocked: number }[];

  // Au-delà d'un dixième du livre, le bannissement coûte plus qu'il ne sert.
  return rows
    .map((r) => ({
      conceptId: String(r.id),
      name: String(r.name),
      blocked: Number(r.blocked),
      share: Number(r.blocked) / totalRecipes,
    }))
    .filter((r) => r.share >= 0.1)
    .slice(0, 6);
}

/** Créneaux de la semaine restés sans plat : le symptôme visible du problème. */
export async function unfilledSlots(weekStart: string): Promise<number> {
  const row = (await rawDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM meal_slots s
       JOIN meal_plans p ON p.id = s.plan_id
       LEFT JOIN meals m ON m.slot_id = s.id
       WHERE p.user_id = ? AND p.week_start = ? AND m.id IS NULL`,
    )
    .get((await currentUserId()), weekStart)) as { c: number } | undefined;
  return Number(row?.c ?? 0);
}
