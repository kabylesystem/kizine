import { currentUserId, needsWelcome } from "@/server/auth";
import { redirect } from "next/navigation";
import { rawDb } from "@/db/client";
import {getProfile} from "@/server/user";
import { planningWeekOf, generateAndStorePlan } from "@/server/plan-service";
import { getLang } from "@/server/lang";
import { weekJourney } from "@/server/journey";
import { Journey } from "@/ui/journey";
import { banBlockers, unfilledSlots } from "@/server/blockers";
import { BanWarning } from "@/ui/ban-warning";
import { Page, Band } from "@/ui/shell";
import { ApproveDeck, type Dish } from "@/ui/approve-deck";

export const dynamic = "force-dynamic";

/**
 * L'écran d'avant-courses : on ne part pas à l'Intermarché avec une semaine
 * qu'on n'a pas choisie. Un plat à la fois, oui, autre chose, ou dehors.
 */
export default async function Approve({ searchParams }: { searchParams: Promise<{ fresh?: string }> }) {
  const lang = await getLang();
  const fresh = (await searchParams).fresh === "1";
  const blockers = await banBlockers(lang);
  const profile = await getProfile();
  if (await needsWelcome()) redirect("/welcome");
  if (!profile?.onboarded) redirect("/onboarding");

  const weekStart = planningWeekOf(new Date(), profile.weekStartsOn);
  const db = rawDb();
  let plan = await db
    .prepare("SELECT id FROM meal_plans WHERE user_id = ? AND week_start = ?")
    .get((await currentUserId()), weekStart) as { id: string } | undefined;
  if (!plan) {
    await generateAndStorePlan(weekStart);
    plan = await db
      .prepare("SELECT id FROM meal_plans WHERE user_id = ? AND week_start = ?")
      .get((await currentUserId()), weekStart) as { id: string } | undefined;
  }
  if (!plan) {
    return (
      <Page>
        <Band title="Approve the week" color="var(--curcuma)" />
        <p className="etal-card p-4">No plan yet.</p>
      </Page>
    );
  }

  const [unfilled, steps] = await Promise.all([unfilledSlots(weekStart), weekJourney(weekStart)]);
  const rows = await db
    .prepare(
      `SELECT s.id AS slot_id, s.date, s.slot, s.label,
              ${lang === "fr" ? "r.title" : "COALESCE(r.title_en, r.title)"} AS title,
              r.id AS recipe_id, r.cuisine, r.active_minutes, a.path AS image,
              ri.kcal, ri.protein_g, m.state
       FROM meal_slots s
       JOIN meals m ON m.slot_id = s.id
       JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       JOIN recipes r ON r.id = ri.recipe_id
       LEFT JOIN image_assets a ON a.id = r.image_id
       WHERE s.plan_id = ?
       ORDER BY s.date, CASE s.slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 ELSE 3 END`,
    )
    .all(plan.id) as unknown as Record<string, unknown>[];

  // Une semaine de 28 repas ne contient qu'une quinzaine de plats : on demande
  // son avis par PLAT, pas par créneau. Dire cinq fois oui au même bol est absurde.
  const byRecipe = new Map<string, Dish>();
  for (const r of rows) {
    const recipeId = String(r["recipe_id"]);
    const slot = { slotId: String(r["slot_id"]), date: String(r["date"]), slot: String(r["slot"]) };
    const existing = byRecipe.get(recipeId);
    if (existing) {
      existing.times += 1;
      existing.slots.push(slot);
      // Un plat compte comme tranché seulement si tous ses créneaux le sont.
      if (String(r["state"]) === "planned") existing.state = "planned";
      continue;
    }
    byRecipe.set(recipeId, {
      recipeId,
      title: String(r["title"] ?? "—"),
      cuisine: String(r["cuisine"] ?? ""),
      image: r["image"] ? String(r["image"]) : null,
      kcal: Number(r["kcal"] ?? 0),
      protein: Number(r["protein_g"] ?? 0),
      minutes: r["active_minutes"] === null ? null : Number(r["active_minutes"]),
      times: 1,
      slots: [slot],
      state: String(r["state"] ?? "planned"),
    });
  }
  // Les vrais repas d'abord : déjeuners et dîners, puis petits-déjeuners, puis collations.
  const RANK: Record<string, number> = { lunch: 0, dinner: 0, breakfast: 1, snack: 2 };
  const rank = (d: Dish) => Math.min(...d.slots.map((s) => RANK[s.slot] ?? 3));
  const dishes = [...byRecipe.values()].sort((a, b) => rank(a) - rank(b));

  // Ce qu'il y a dedans, en une ligne : personne ne valide un plat sans savoir.
  const ingRows = (await db
    .prepare(
      `SELECT ri.recipe_id AS recipe_id, ${lang === "fr" ? "c.name_fr" : "c.name_en"} AS name, ri.role AS role
       FROM recipe_ingredients ri JOIN food_concepts c ON c.id = ri.concept_id
       WHERE ri.optional = 0
       ORDER BY ri.recipe_id, ri.position`,
    )
    .all()) as { recipe_id: string; name: string; role: string }[];
  const ingredients: Record<string, string[]> = {};
  for (const r of ingRows) {
    const id = String(r.recipe_id);
    if (!byRecipe.has(id)) continue;
    (ingredients[id] ??= []).push(String(r.name));
  }

  const goal = await db.prepare("SELECT meals_out_per_week FROM goals WHERE user_id = ?").get((await currentUserId())) as
    | { meals_out_per_week: number }
    | undefined;

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const label = `${new Date(weekStart).toLocaleDateString("en-GB", opts)} to ${weekEnd.toLocaleDateString("en-GB", opts)}`;

  return (
    <Page>
      <Band
        title={lang === "fr" ? "Valide ta semaine" : "Approve your week"}
        note={`${label} · ${dishes.length} ${lang === "fr" ? "plats distincts" : "distinct dishes"}`}
        color="var(--curcuma)"
      />
      <BanWarning blockers={blockers} unfilled={unfilled} lang={lang} />

      {fresh ? (
        <p className="mb-4 max-w-[62ch] text-[15px] leading-snug">
          <b>{lang === "fr" ? "Ta semaine est prête." : "Your week is ready."}</b>{" "}
          <span style={{ color: "var(--soft)" }}>
            {lang === "fr"
              ? "Garde ce qui te tente, change le reste. Une fois tout tranché, la liste de courses s'écrit toute seule."
              : "Keep what you fancy, swap the rest. Once it is all decided, the shopping list writes itself."}
          </span>
        </p>
      ) : null}

      <Journey steps={steps} lang={lang} />

      <ApproveDeck
        dishes={dishes}
        ingredients={ingredients}
        weekStart={weekStart}
        mealsOut={Number(goal?.meals_out_per_week ?? 0)}
        lang={lang}
      />
    </Page>
  );
}
