"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SwipeDeck } from "./swipe-deck";
import { Duels } from "./duels";
import { Frequency } from "./frequency";
import { WeekRhythm } from "./week-rhythm";
import { BodyGoal } from "./body-goal";
import { Kitchen } from "./kitchen";
import { EnergyStep } from "./energy-step";
import type { DayPlanDraft, OnboardingData, OnboardingResult, Verdict } from "./types";
import { planFor } from "@/core/tdee";
import { PORK_CARD_ID, PORK_CONCEPT_IDS } from "@/data/pork";

type Stage = "intro" | "triage" | "duels" | "frequency" | "rhythm" | "body" | "energy" | "kitchen" | "building";

const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "triage", label: "Sort", color: "var(--tomate)" },
  { id: "duels", label: "Duels", color: "var(--betterave)" },
  { id: "frequency", label: "Limits", color: "var(--curcuma)" },
  { id: "rhythm", label: "Week", color: "var(--myrtille)" },
  { id: "body", label: "Body", color: "var(--feuille)" },
  { id: "energy", label: "Burn", color: "var(--myrtille)" },
  { id: "kitchen", label: "Kitchen", color: "var(--aubergine)" },
];

const emptyResult = (): OnboardingResult => ({
  verdicts: {},
  elo: {},
  duels: [],
  frequency: {},
  days: [],
  body: {
    weightKg: 65,
    heightCm: 170,
    ageYears: 25,
    sex: null,
    activityFactor: 1.55,
    goalKind: "maintain",
    kgPerWeek: 0,
    proteinPerKg: 1.8,
    kcalTarget: 0,
    proteinTarget: 117,
  },
  energy: {
    dailyLife: "mixed",
    sessions: [],
    commutes: [],
    maintenanceKcal: 0,
  },
  kitchen: {
    equipment: [],
    spiceTolerance: 3,
    maxPans: 3,
    shoppingWeekday: 2,
    weeklyBudgetEur: 90,
    leftoverTolerance: 1,
  },
});

const STATE_KEY = "semoule:onboarding";
const STATE_LEGACY = "etal:onboarding";

export function Onboarding({ data }: { data: OnboardingData }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("intro");
  const [result, setResult] = useState<OnboardingResult>(emptyResult);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [maxStage, setMaxStage] = useState(0);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STATE_KEY) ?? window.localStorage.getItem(STATE_LEGACY);
      if (raw) {
        const saved = JSON.parse(raw) as { stage: Stage; result: OnboardingResult; maxStage?: number };
        if (saved.stage && saved.stage !== "building") {
          setStage(saved.stage);
          setResult({ ...saved.result, body: { ...emptyResult().body, ...saved.result.body } });
          const reached = STAGES.findIndex((x) => x.id === saved.stage);
          setMaxStage(Math.max(saved.maxStage ?? 0, reached === -1 ? 0 : reached));
        }
      }
    } catch {
      /* mode privé : on repart de zéro */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored || stage === "building") return;
    try {
      window.localStorage.setItem(STATE_KEY, JSON.stringify({ stage, result, maxStage }));
    } catch {
      /* ignore */
    }
  }, [stage, result, restored, maxStage]);

  const lovedCards = useMemo(
    () =>
      data.deck
        .filter((c) => result.verdicts[c.id] === "love")
        .filter((c) => ["protein", "carb", "vegetable", "dairy"].includes(c.category))
        .slice(0, 10),
    [data.deck, result.verdicts],
  );

  const eligibleDishes = useMemo(() => {
    const banned = new Set(Object.entries(result.verdicts).filter(([, v]) => v === "never").map(([k]) => k));
    const ok = data.dishes.filter((d) => !d.concepts.some((c) => banned.has(c)));
    return ok.length >= 12 ? ok : data.dishes;
  }, [data.dishes, result.verdicts]);

  const submit = useCallback(
    async (final: OnboardingResult) => {
      setStage("building");
      setError(null);
      try {
        const res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(final),
        });
        if (!res.ok) throw new Error(await res.text());
        try {
          window.localStorage.removeItem(STATE_KEY);
          window.localStorage.removeItem("semoule:deck");
          window.localStorage.removeItem("semoule:duels");
        } catch {
          /* ignore */
        }
        // On atterrit là où il y a quelque chose à faire, pas sur un tableau de
        // bord : la première question de l'écran de validation ouvre le parcours.
        router.push("/approve?fresh=1");
      } catch (e) {
        setError((e as Error).message);
        goTo("kitchen");
      }
    },
    [router],
  );

  const stageIndex = STAGES.findIndex((s) => s.id === stage);

  const goTo = useCallback(
    (next: Stage) => {
      const i = STAGES.findIndex((x) => x.id === next);
      if (i > -1) setMaxStage((m) => Math.max(m, i));
      setStage(next);
    },
    [],
  );

  return (
    <div className="min-h-dvh" style={{ background: "var(--ground)" }}>
      {stage !== "intro" && stage !== "building" ? (
        <div className="sticky top-0 z-30 border-b px-4 py-3" style={{ background: "var(--ground)", borderColor: "var(--line)" }}>
          <div className="mx-auto flex max-w-[820px] items-center gap-1.5">
            {STAGES.map((s, i) => {
              const reachable = i <= maxStage;
              return (
                <button
                  key={s.id}
                  onClick={() => reachable && setStage(s.id)}
                  disabled={!reachable}
                  className="flex flex-1 flex-col gap-1 text-left transition-transform duration-150 enabled:hover:-translate-y-0.5 disabled:cursor-default"
                  title={reachable ? `Go back to ${s.label}` : "Not reached yet"}
                >
                  <span
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{ background: i <= stageIndex ? s.color : reachable ? "var(--surface3)" : "var(--surface2)" }}
                  />
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide"
                    style={{
                      color: i === stageIndex ? s.color : "var(--soft)",
                      opacity: i === stageIndex ? 1 : reachable ? 0.85 : 0.45,
                    }}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mx-auto mt-2 flex max-w-[820px] justify-end">
            <button
              onClick={() => {
                try {
                  window.localStorage.removeItem(STATE_KEY);
                  window.localStorage.removeItem("semoule:deck");
                  window.localStorage.removeItem("semoule:duels");
                } catch {
                  /* ignore */
                }
                setResult(emptyResult());
                setMaxStage(0);
                setStage("intro");
              }}
              className="text-[11px] font-semibold underline-offset-4 hover:underline"
              style={{ color: "var(--soft)" }}
            >
              start over
            </button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-[860px] flex-col items-center px-4 py-6">
        {stage === "intro" ? <Intro onStart={() => goTo("triage")} deckSize={data.deck.length} /> : null}

        {stage === "triage" ? (
          <Round
            title="What do you actually eat?"
            subtitle="Swipe or use the arrow keys. Never means never: it becomes a hard rule."
          >
            <SwipeDeck
              cards={data.deck}
              onDone={(verdicts) => {
                const pork = verdicts[PORK_CARD_ID];
                const expanded = pork ? Object.fromEntries(PORK_CONCEPT_IDS.map((id) => [id, pork])) : {};
                setResult((r) => ({ ...r, verdicts: { ...expanded, ...verdicts } }));
                goTo("duels");
              }}
            />
          </Round>
        ) : null}

        {stage === "duels" ? (
          <Round title="Which one tonight?" subtitle="No right answer. Pick fast, that is the point.">
            <Duels
              dishes={eligibleDishes}
              onDone={(elo, duels) => {
                setResult((r) => ({ ...r, elo, duels }));
                goTo("frequency");
              }}
            />
          </Round>
        ) : null}

        {stage === "frequency" ? (
          <Round title="How often before you are sick of it?" subtitle="Only for the things you love. The rest doesn't need a limit.">
            {lovedCards.length ? (
              <Frequency
                loved={lovedCards}
                initial={result.frequency}
                onDone={(frequency) => {
                  setResult((r) => ({ ...r, frequency }));
                  goTo("rhythm");
                }}
              />
            ) : (
              <button className="etal-btn" onClick={() => goTo("rhythm")}>
                Nothing to limit, next
              </button>
            )}
          </Round>
        ) : null}

        {stage === "rhythm" ? (
          <Round title="Your week, for real" subtitle="School days, home days, and the day you do the shopping.">
            <WeekRhythm
              initialDays={result.days}
              initialShopping={result.kitchen.shoppingWeekday}
              onDone={(days: DayPlanDraft[], shoppingWeekday: number) => {
                setResult((r) => ({ ...r, days, kitchen: { ...r.kitchen, shoppingWeekday } }));
                goTo("body");
              }}
            />
          </Round>
        ) : null}

        {stage === "body" ? (
          <Round title="The numbers" subtitle="Everything below is computed, and you can see the formula.">
            <BodyGoal
              initial={result.body}
              onDone={(body) => {
                setResult((r) => ({ ...r, body }));
                goTo("energy");
              }}
            />
          </Round>
        ) : null}

        {stage === "energy" ? (
          <Round
            title="What you actually burn"
            subtitle="Sport, trips, daily life. Each one is computed on its own, so five yoga classes and five MMA sessions never land on the same number."
          >
            <EnergyStep
              weightKg={result.body.weightKg}
              heightCm={result.body.heightCm}
              ageYears={result.body.ageYears}
              sex={result.body.sex ?? "f"}
              initial={result.energy}
              onDone={(energy, maintenanceKcal) => {
                setResult((r) => ({
                  ...r,
                  energy: { ...energy, maintenanceKcal },
                  // La dépense mesurée remplace le facteur d'activité approximatif.
                  body: {
                    ...r.body,
                    kcalTarget: planFor(maintenanceKcal, r.body.weightKg, r.body.kgPerWeek, null).targetKcal,
                  },
                }));
                goTo("kitchen");
              }}
            />
          </Round>
        ) : null}

        {stage === "kitchen" ? (
          <Round title="Your kitchen" subtitle="This filters recipes hard. Better to be honest.">
            <>
              <Kitchen
                shoppingWeekday={result.kitchen.shoppingWeekday}
                initial={result.kitchen}
                onDone={(kitchen) => {
                  const final = { ...result, kitchen };
                  setResult(final);
                  void submit(final);
                }}
              />
              {error ? (
                <p className="mt-3 text-[13px] font-semibold" style={{ color: "var(--tomate)" }}>
                  {error}
                </p>
              ) : null}
            </>
          </Round>
        ) : null}

        {stage === "building" ? <Building /> : null}
      </div>
    </div>
  );
}

function Round({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="w-full max-w-[720px] text-center">
        <h2 className="text-[clamp(26px,5vw,40px)] leading-[1]">{title}</h2>
        <p className="mx-auto mt-2 max-w-[46ch] text-[14px]" style={{ color: "var(--soft)" }}>
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  );
}

function Intro({ onStart, deckSize }: { onStart: () => void; deckSize: number }) {
  return (
    <div className="flex w-full max-w-[620px] flex-col gap-5 py-8">
      <div>
        <h1 className="text-[clamp(56px,13vw,110px)] leading-[0.84]">
          Cook fresh.
          <br />
          <span style={{ color: "var(--tomate)" }}>Hit your number.</span>
          <br />
          Decide nothing.
        </h1>
      </div>
      <p className="max-w-[44ch] text-[17px]" style={{ color: "var(--soft)" }}>
        Ten minutes now buys you months of never wondering what to eat. Nothing here is a medical form.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { n: deckSize, l: "foods to sort", c: "var(--tomate)" },
          { n: 22, l: "dish duels", c: "var(--betterave)" },
          { n: 7, l: "days to map", c: "var(--myrtille)" },
          { n: 109, l: "recipes waiting", c: "var(--feuille)" },
          { n: 3484, l: "CIQUAL foods", c: "var(--curcuma)" },
          { n: 0, l: "numbers invented", c: "var(--aubergine)" },
        ].map((s) => (
          <div key={s.l} className="rounded-[7px] p-3" style={{ background: s.c, color: "var(--on-color)" }}>
            <div className="display tabnum text-[30px] leading-none">{s.n}</div>
            <div className="mt-0.5 text-[12px] font-semibold opacity-90">{s.l}</div>
          </div>
        ))}
      </div>
      <button className="etal-btn etal-btn--color text-[17px]" style={{ "--c": "#d63127" } as React.CSSProperties} onClick={onStart}>
        Start sorting
      </button>
    </div>
  );
}

function Building() {
  return (
    <div className="flex min-h-[60vh] w-full max-w-[520px] flex-col items-center justify-center gap-4 text-center">
      <div className="flex gap-1.5">
        {["var(--tomate)", "var(--feuille)", "var(--myrtille)", "var(--curcuma)", "var(--betterave)"].map((c, i) => (
          <span
            key={c}
            className="h-10 w-4 rounded-sm"
            style={{ background: c, animation: `pulse 1.1s ${i * 0.11}s ease-in-out infinite` }}
          />
        ))}
      </div>
      <h2 className="text-[28px]">Building your week</h2>
      <p className="text-[14px]" style={{ color: "var(--soft)" }}>
        Scoring 109 recipes against your taste, your week, your kitchen and your targets.
      </p>
      <style>{`@keyframes pulse { 0%,100% { transform: scaleY(0.45); opacity: .5 } 50% { transform: scaleY(1); opacity: 1 } }`}</style>
    </div>
  );
}
