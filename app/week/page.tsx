import { currentUserId, needsWelcome } from "@/server/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/server/user";
import { loadPlan, mondayOf, planningWeekOf, addWeeks, generateAndStorePlan } from "@/server/plan-service";
import { getLang } from "@/server/lang";
import { weekJourney } from "@/server/journey";
import { Journey } from "@/ui/journey";
import { banBlockers, unfilledSlots } from "@/server/blockers";
import { BanWarning } from "@/ui/ban-warning";
import { Page, Band, SLOT_COLOR, SLOT_LABEL } from "@/ui/shell";
import { Replan } from "@/ui/replan";
import { DayContext } from "@/ui/day-context";
import { MoveMeal, type MoveTarget } from "@/ui/move-meal";
import { MealMenu } from "@/ui/meal-menu";
import { isFreeRecipe } from "@/server/free-dish";
import { WeekStart } from "@/ui/week-start";
import { rawDb } from "@/db/client";

export const dynamic = "force-dynamic";

const SLOT_ORDER = ["breakfast", "lunch", "snack", "dinner"];

export default async function Week({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const [lang, profile, params] = await Promise.all([getLang(), getProfile(), searchParams]);
  if (await needsWelcome()) redirect("/welcome");
  if (!profile?.onboarded) redirect("/onboarding");

  // Les deux bornes se calculent sur le profil déjà chargé : plus de requête.
  const thisWeek = mondayOf(new Date(), profile.weekStartsOn);
  const nextShop = planningWeekOf(new Date(), profile.weekStartsOn);
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(params.w ?? "") ? params.w! : nextShop;
  const endDate = new Date(`${weekStart}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const dayFmt: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
  const weekLabel = `${new Date(`${weekStart}T00:00:00Z`).toLocaleDateString("en-GB", dayFmt)} → ${endDate.toLocaleDateString("en-GB", dayFmt)}`;
  const [blockers, unfilled, loaded, steps] = await Promise.all([
    banBlockers(lang),
    unfilledSlots(weekStart),
    loadPlan(weekStart, lang),
    weekJourney(weekStart),
  ]);
  let plan = loaded;
  if (!plan) {
    await generateAndStorePlan(weekStart);
    plan = await loadPlan(weekStart, lang);
  }
  const rows = plan?.rows ?? [];

  const dates = [...new Set(rows.map((r) => r.date))];

  // Un plat ne s'échange qu'avec un créneau du même type, non cuisiné.
  const swappable = new Map<string, MoveTarget[]>();
  for (const r of rows) {
    if (!r.recipeId || r.state === "cooked") continue;
    swappable.set(
      r.slotId,
      rows
        .filter((o) => o.slot === r.slot && o.slotId !== r.slotId && o.recipeId && o.state !== "cooked")
        .map((o) => ({ slotId: o.slotId, date: o.date, title: o.title ?? "—" })),
    );
  }
  const overrides = new Map(
    (
      await rawDb()
        .prepare("SELECT date, context, no_snack FROM day_overrides WHERE user_id = ?")
        .all((await currentUserId())) as unknown as { date: string; context: string; no_snack: number }[]
    ).map((r) => [r.date, { context: r.context, noSnack: Number(r.no_snack) === 1 }]),
  );
  const byDate = new Map(dates.map((d) => [d, rows.filter((r) => r.date === d)]));

  const totalKcal = rows.reduce((s, r) => s + (r.kcal ?? 0), 0);
  const totalProtein = rows.reduce((s, r) => s + (r.protein ?? 0), 0);
  const cuisines = new Set(rows.map((r) => r.cuisine).filter(Boolean)).size;
  const distinct = new Set(rows.map((r) => r.recipeId).filter(Boolean)).size;

  return (
    <Page>
      <Band
        title={weekStart === thisWeek ? "This week" : weekStart === nextShop ? "Next shop" : "Week of"}
        note={weekLabel}
        color="var(--myrtille)"
      />
      <Journey steps={steps} lang={lang} />

      <BanWarning blockers={blockers} unfilled={unfilled} lang={lang} />

      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/week?w=${addWeeks(weekStart, -1)}`} className="etal-btn etal-btn--quiet text-[14px] no-underline">
            ← Previous
          </Link>
          <Link href={`/week?w=${addWeeks(weekStart, 1)}`} className="etal-btn etal-btn--quiet text-[14px] no-underline">
            Next →
          </Link>
          <Replan weekStart={weekStart} />
          <WeekStart
            current={profile.weekStartsOn}
            shoppingWeekday={profile.shoppingWeekday}
            weekStart={weekStart}
            lang={lang}
          />
        </div>
      </div>

      <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px]" style={{ color: "var(--soft)" }}>
        <span>
          <b className="tabnum" style={{ color: "var(--ink)" }}>{Math.round(totalKcal / Math.max(1, dates.length))}</b> kcal a day
        </span>
        <span>
          <b className="tabnum" style={{ color: "var(--ink)" }}>{Math.round(totalProtein / Math.max(1, dates.length))}</b> g protein
        </span>
        <span>
          <b className="tabnum" style={{ color: "var(--ink)" }}>{distinct}</b> recipes
        </span>
        <span>
          <b className="tabnum" style={{ color: "var(--ink)" }}>{cuisines}</b> cuisines
        </span>
      </p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {dates.map((date) => {
          const day = (byDate.get(date) ?? []).sort(
            (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
          );
          const kcal = day.reduce((s, r) => s + (r.kcal ?? 0), 0);
          const protein = day.reduce((s, r) => s + (r.protein ?? 0), 0);
          return (
            <div key={date} className="etal-card overflow-hidden">
              <div className="flex items-baseline justify-between px-3 pb-1 pt-3">
                <span className="text-[15px] font-bold">
                  {new Date(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <span className="tabnum text-[12px] font-semibold" style={{ color: "var(--soft)" }}>
                  {Math.round(kcal)} kcal · {Math.round(protein)} g P
                </span>
              </div>
              <div className="px-2 pt-1">
                <DayContext
                  date={date}
                  current={overrides.get(date)?.context ?? null}
                  noSnack={overrides.get(date)?.noSnack ?? false}
                  compact
                />
              </div>
              <div className="flex flex-col gap-1 p-2">
                {day.map((r) => (
                  <MealMenu key={r.slotId} slotId={r.slotId} title={r.title ?? "—"} state={r.state} lang={lang} free={isFreeRecipe(r.recipeId)}>
                  <div
                    className="flex items-center gap-1 rounded-md pr-1.5"
                    style={{
                      background: "var(--ground)",
                      opacity: r.state === "cooked" ? 0.5 : r.state === "skipped" ? 0.4 : 1,
                      textDecoration: r.state === "skipped" ? "line-through" : "none",
                    }}
                  >
                  <Link
                    href={isFreeRecipe(r.recipeId) ? "/free" : `/cook/${encodeURIComponent(r.slotId)}`}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-2 no-underline transition-colors duration-150"
                    style={{ color: "var(--ink)" }}
                  >
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: SLOT_COLOR[r.slot] }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: SLOT_COLOR[r.slot] }}>
                        {SLOT_LABEL[r.slot]}
                      </div>
                      <div className="truncate text-[13.5px] font-semibold">{r.title ?? "—"}</div>
                    </div>
                    <span className="tabnum shrink-0 text-[12px] font-bold" style={{ color: "var(--soft)" }}>
                      {isFreeRecipe(r.recipeId) ? "≈ " : ""}{Math.round(r.kcal ?? 0)}
                    </span>
                  </Link>
                  {swappable.has(r.slotId) ? (
                    <MoveMeal slotId={r.slotId} targets={swappable.get(r.slotId) ?? []} lang={lang} />
                  ) : null}
                  </div>
                  </MealMenu>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Page>
  );
}
