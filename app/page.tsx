import { currentUserId, needsWelcome } from "@/server/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/server/user";
import { loadPlan, mondayOf, generateAndStorePlan } from "@/server/plan-service";
import { getLang } from "@/server/lang";
import { weekJourney } from "@/server/journey";
import { Journey } from "@/ui/journey";
import { MealMenu } from "@/ui/meal-menu";
import { AteButton } from "@/ui/ate-button";
import { AddEntry, type PortionOption } from "@/ui/add-entry";
import { WhatsNew } from "@/ui/whats-new";
import { dayBalance } from "@/server/day-balance";
import { DayGap } from "@/ui/day-gap";
import { banBlockers, unfilledSlots } from "@/server/blockers";
import { BanWarning } from "@/ui/ban-warning";
import { Page, Band, Meter, SLOT_COLOR, SLOT_SOLID, SLOT_LABEL } from "@/ui/shell";
import { explain } from "@/core/planner";
import { dayVerdict } from "@/core/verdict";
import { DayContext } from "@/ui/day-context";
import { Scanner } from "@/ui/scanner";
import { rawDb } from "@/db/client";
import { isFreeRecipe, listFreeDishes } from "@/server/free-dish";
import { CURRENT_RELEASE } from "@/data/releases";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  good: "var(--feuille)",
  track: "var(--myrtille)",
  short: "var(--curcuma)",
  over: "var(--curcuma)",
};

/**
 * Une journée est un registre de ce qui est mangé, exact ou estimé, plus ce
 * qui reste prévu. Tout en haut : deux jauges et une phrase qui répond à la
 * seule question du soir. Le reste, c'est la liste des repas, un tap pour
 * « mangé », un ⋯ pour tout le reste.
 */
export default async function Today() {
  const [lang, profile] = await Promise.all([getLang(), getProfile()]);
  if (await needsWelcome()) redirect("/welcome");
  if (!profile?.onboarded) redirect("/onboarding");

  const userId = await currentUserId();
  const weekStart = mondayOf(new Date(), profile.weekStartsOn);
  const [blockers, unfilled, loaded, steps, dishes, account] = await Promise.all([
    banBlockers(lang),
    unfilledSlots(weekStart),
    loadPlan(weekStart, lang),
    weekJourney(weekStart),
    listFreeDishes(),
    rawDb().prepare("SELECT seen_release FROM users WHERE id = ?").get(userId) as Promise<{ seen_release: string | null } | undefined>,
  ]);
  let plan = loaded;
  if (!plan) {
    await generateAndStorePlan(weekStart);
    plan = await loadPlan(weekStart, lang);
  }
  const today = new Date().toISOString().slice(0, 10);
  const rows = (plan?.rows ?? []).filter((r) => r.date === today);
  const fallback = (plan?.rows ?? []).filter((r) => r.date === (plan?.rows[0]?.date ?? today));
  const list = rows.length ? rows : fallback;
  const currentDate = list[0]?.date ?? today;

  const [balance, override] = await Promise.all([
    dayBalance(currentDate, profile.kcalTarget),
    rawDb()
      .prepare("SELECT context, no_snack FROM day_overrides WHERE user_id = ? AND date = ?")
      .get(userId, currentDate) as Promise<{ context: string; no_snack: number } | undefined>,
  ]);

  const nextUp = list.find((r) => r.state !== "cooked" && r.state !== "skipped" && r.state !== "eating_out");
  const portions: PortionOption[] = dishes
    .filter((d) => d.portions - d.placed > 0)
    .map((d) => ({ dishId: d.id, title: d.title, kcal: d.kcal, protein: d.protein, left: d.portions - d.placed }));
  const verdict = balance
    ? dayVerdict({
        target: profile.kcalTarget,
        eaten: balance.eaten,
        eatenLow: balance.eatenLow,
        eatenHigh: balance.eatenHigh,
        open: balance.openKcal,
        proteinTarget: profile.proteinTargetG,
        protein: balance.eatenProtein,
        proteinLow: balance.proteinLow,
        openProtein: balance.openProtein,
        goal: profile.goalKind,
        lang,
      })
    : null;
  const showWhatsNew = account?.seen_release !== CURRENT_RELEASE;
  const fr = lang === "fr";

  return (
    <Page>
      <Band
        title="Today"
        note={new Date(currentDate).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        color="var(--argile)"
      />

      {showWhatsNew ? <WhatsNew lang={lang} /> : null}

      <Journey steps={steps} lang={lang} />

      <BanWarning blockers={blockers} unfilled={unfilled} lang={lang} />

      <DayContext date={currentDate} current={override?.context ?? null} noSnack={Number(override?.no_snack ?? 0) === 1} />

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Meter
          label="Energy"
          value={balance?.eaten ?? 0}
          estimated={balance?.roughEaten ?? 0}
          expected={balance?.openKcal ?? 0}
          target={profile.kcalTarget}
          color="var(--argile)"
          unit="kcal"
        />
        <Meter
          label="Protein"
          value={balance?.eatenProtein ?? 0}
          estimated={balance && balance.roughEaten > 0 ? Math.round((balance.eatenProtein * balance.roughEaten) / Math.max(1, balance.eaten)) : 0}
          expected={balance?.openProtein ?? 0}
          target={profile.proteinTargetG}
          color="var(--feuille)"
          unit="g"
        />
      </div>

      {verdict ? (
        <div className="mt-2 flex items-stretch gap-3 rounded-[7px] p-3" style={{ background: "var(--surface)" }}>
          <span className="w-1.5 shrink-0 rounded-full" style={{ background: TONE[verdict.tone] }} />
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: TONE[verdict.tone] }}>
              {fr ? "Le verdict du jour" : "Today's verdict"}
              {balance && balance.roughEaten > 0 ? (fr ? " · une partie estimée" : " · some of it estimated") : ""}
            </div>
            <div className="mt-0.5 text-[16px] font-bold leading-snug">{verdict.text}</div>
          </div>
        </div>
      ) : null}

      {balance ? <DayGap balance={balance} lang={lang} /> : null}

      <div className="mt-3">
        <AddEntry date={currentDate} portions={portions} lang={lang} strip />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Link href="/free" className="text-[13px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--argile)" }}>
            {fr ? "🍲 J'ai fait une marmite, je la compte →" : "🍲 I cooked a pot, count it →"}
          </Link>
          <Scanner compact />
        </div>
      </div>

      {nextUp ? (
        <Link
          href={isFreeRecipe(nextUp.recipeId) ? "/free" : `/cook/${encodeURIComponent(nextUp.slotId)}`}
          className="relative mt-4 block overflow-hidden rounded-[9px] no-underline transition-transform duration-200 hover:-translate-y-1"
          style={{ background: SLOT_COLOR[nextUp.slot], color: "#fff" }}
        >
          {nextUp.image ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={nextUp.image} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ opacity: 0.55 }} />
              <span
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(105deg, ${SLOT_SOLID[nextUp.slot]} 8%, ${SLOT_SOLID[nextUp.slot]}cc 42%, ${SLOT_SOLID[nextUp.slot]}33 100%)`,
                }}
              />
            </>
          ) : null}
          <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[13px] font-bold uppercase tracking-wide opacity-80">Next up · {nextUp.label}</div>
              <div className="display mt-1 text-[clamp(30px,6vw,52px)] leading-[0.95]">{nextUp.title ?? "Nothing planned"}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-white/22 px-2.5 py-1 text-[12px] font-bold">
                  {isFreeRecipe(nextUp.recipeId) ? "≈ " : ""}
                  {Math.round(nextUp.kcal ?? 0)} kcal
                </span>
                <span className="rounded-full bg-white/22 px-2.5 py-1 text-[12px] font-bold">{Math.round(nextUp.protein ?? 0)} g protein</span>
                {nextUp.activeMinutes ? (
                  <span className="rounded-full bg-white/22 px-2.5 py-1 text-[12px] font-bold">{nextUp.activeMinutes} min</span>
                ) : null}
              </div>
            </div>
            <span className="etal-btn shrink-0" style={{ background: "#fff", color: SLOT_SOLID[nextUp.slot] }}>
              {isFreeRecipe(nextUp.recipeId) ? "Reheat this" : "Cook this"}
            </span>
          </div>
          {nextUp.explanation && !isFreeRecipe(nextUp.recipeId) ? (
            <div className="relative border-t border-white/20 px-5 py-3 text-[13px] opacity-90">
              {explain(nextUp.explanation).slice(0, 2).join(" · ")}
            </div>
          ) : null}
        </Link>
      ) : null}

      <div className="mb-2 mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px]">{fr ? "La journée" : "The day"}</h2>
        <span className="text-[12px]" style={{ color: "var(--soft)" }}>
          {fr ? "✓ mangé tel quel · ⋯ autre chose, ou pas mangé" : "✓ ate it as planned · ⋯ something else, or not eaten"}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((r) => {
          const eatenRow = r.state === "cooked";
          const off = r.state === "skipped" || r.state === "eating_out";
          const free = isFreeRecipe(r.recipeId);
          return (
            <MealMenu
              key={r.slotId}
              slotId={r.slotId}
              title={r.title ?? "—"}
              state={r.state}
              lang={lang}
              free={free}
              date={currentDate}
              slotKcal={r.kcalTarget}
              portions={portions}
              withButton
            >
              <div className="flex items-center gap-1">
                <Link
                  href={free ? "/free" : `/cook/${encodeURIComponent(r.slotId)}`}
                  className="etal-card flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden p-3 no-underline"
                  style={{ color: "var(--ink)", opacity: eatenRow ? 0.55 : off ? 0.4 : 1 }}
                >
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.image}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-[6px] object-cover sm:h-14 sm:w-14"
                      style={{ boxShadow: `inset 0 0 0 2px ${SLOT_SOLID[r.slot]}` }}
                    />
                  ) : (
                    <span className="h-11 w-1.5 shrink-0 rounded-full" style={{ background: SLOT_COLOR[r.slot] }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: SLOT_COLOR[r.slot] }}>
                      {r.slotId.includes(":extra-") ? (fr ? "En plus" : "Extra") : (SLOT_LABEL[r.slot] ?? r.slot)}
                      {eatenRow ? (fr ? " · mangé" : " · eaten") : off ? (fr ? " · pas mangé" : " · not eaten") : ""}
                    </div>
                    <div className="truncate text-[15px] font-bold">{r.title ?? "—"}</div>
                  </div>
                  <div className="tabnum w-[58px] shrink-0 text-right">
                    <div className="text-[15px] font-bold">
                      {free ? "≈ " : ""}
                      {Math.round(r.kcal ?? 0)}
                    </div>
                    <div className="text-[11px] font-semibold" style={{ color: "var(--soft)" }}>
                      {Math.round(r.protein ?? 0)} g P
                    </div>
                  </div>
                </Link>
                {!eatenRow && !off && r.recipeId ? <AteButton slotId={r.slotId} lang={lang} /> : null}
              </div>
            </MealMenu>
          );
        })}
      </div>

    </Page>
  );
}
