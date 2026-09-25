import { migrate, rawDb } from "@/db/client";
import type { DeckCard, DuelDish, OnboardingData } from "@/ui/onboarding/types";
import { PORK_CARD_ID, PORK_CONCEPT_IDS } from "@/data/pork";

const CATEGORY_ORDER = ["protein", "carb", "vegetable", "fruit", "dairy", "fat", "sauce", "spice", "staple"];

export async function loadOnboardingData(): Promise<OnboardingData> {
  await migrate();
  const db = rawDb();

  const rows = await db
    .prepare(
      `SELECT c.id, c.name_fr, c.name_en, c.category, c.role, c.tags, a.path
       FROM food_concepts c
       LEFT JOIN image_assets a ON a.id = c.image_id
       WHERE c.swipeable = 1`,
    )
    .all() as unknown as {
    id: string;
    name_fr: string;
    name_en: string;
    category: string;
    role: string;
    tags: string;
    path: string | null;
  }[];

  // Une seule carte porc : quatre d'affilée, c'était lourd pour qui n'en mange
  // pas. Le verdict est recopié sur chaque produit de porc côté client.
  const otherPork = new Set<string>(PORK_CONCEPT_IDS.filter((id) => id !== PORK_CARD_ID));
  const deck: DeckCard[] = rows
    .filter((r) => !otherPork.has(r.id))
    .map((r) => ({
      id: r.id,
      nameFr: r.id === PORK_CARD_ID ? "Porc" : r.name_fr,
      nameEn: r.id === PORK_CARD_ID ? "Pork" : r.name_en,
      category: r.category,
      role: r.role,
      tags: JSON.parse(r.tags) as string[],
      image: r.path,
    }))
    .sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.category);
      const bi = CATEGORY_ORDER.indexOf(b.category);
      if (ai !== bi) return ai - bi;
      return a.nameEn.localeCompare(b.nameEn);
    });

  const dishRows = await db
    .prepare(
      `SELECT r.id, COALESCE(r.title_en, r.title) AS title, r.cuisine, r.flavor_profiles, r.active_minutes, a.path,
              (SELECT group_concat(ri.concept_id) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id AND ri.optional = 0) AS concepts
       FROM recipes r
       LEFT JOIN image_assets a ON a.id = r.image_id
       WHERE r.enabled = 1 AND r.slot_kinds LIKE '%dinner%'`,
    )
    .all() as unknown as {
    id: string;
    title: string;
    cuisine: string;
    flavor_profiles: string;
    active_minutes: number;
    path: string | null;
    concepts: string | null;
  }[];

  const conceptImage = new Map(
    (
      await db
        .prepare(
          `SELECT c.id, a.path FROM food_concepts c JOIN image_assets a ON a.id = c.image_id`,
        )
        .all() as unknown as { id: string; path: string }[]
    ).map((r) => [r.id, r.path]),
  );

  const dishes: DuelDish[] = dishRows.map((r) => {
    const concepts = (r.concepts ?? "").split(",").filter(Boolean);
    const hero = concepts.find((c) => conceptImage.has(c));
    return {
      id: r.id,
      title: r.title,
      cuisine: r.cuisine,
      flavors: JSON.parse(r.flavor_profiles) as string[],
      activeMinutes: r.active_minutes,
      // La photo du PLAT d'abord : un duel doit montrer l'assiette, pas un ingrédient.
      image: r.path ?? (hero ? conceptImage.get(hero) ?? null : null),
      concepts,
    };
  });

  return { deck, dishes };
}
