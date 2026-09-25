"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SPORTS,
  sessionKcal,
  sessionMinutes,
  sessionTotalMinutes,
  sportById,
  type TrainingSession,
} from "@/core/training";
import { AddressField } from "./address-field";
import {
  COMMUTE_MODES,
  DAILY_LIFE,
  GOALS,
  planFor,
  proteinTarget,
  tdee,
  type Commute,
  type CommuteMode,
  type DailyLife,
  type GoalKind,
  type Sex,
} from "@/core/tdee";

export interface StoredCommute extends Commute {
  id: string;
  label: string;
  fromAddress: string | null;
  toAddress: string | null;
}

interface Props {
  lang: "en" | "fr";
  weightKg: number;
  heightCm: number;
  ageYears: number;
  bodyFatPct: number | null;
  dailyLife: DailyLife;
  goalKind: GoalKind;
  sex: Sex;
  currentTarget: number;
  targetKg: number | null;
  breakfastDays: number;
  /** Vitesse déjà enregistrée, pour repérer une modification non sauvegardée. */
  savedRate: number;
  sessions: TrainingSession[];
  commutes: StoredCommute[];
  macros: { proteinG: number; carbG: number; fatG: number } | null;
}

const T = {
  en: {
    life: "A normal day, outside sport",
    sport: "What you actually train",
    trips: "Trips you make every week",
    goal: "What you are after",
    pick: "Tap the sports you do. Each one splits into blocks, because a session is not one intensity.",
    addTrip: "Add a trip",
    from: "from",
    to: "to",
    perWeek: "return trips a week",
    distance: "km one way",
    resolve: "Work out the distance",
    save: "Save",
    apply: "Use",
    applied: "Applied",
    rate: "kg a week",
    resting: "at rest",
    thermic: "digesting food",
    dailyLife: "daily life",
    commute: "trips",
    training: "training",
    total: "you burn",
    target: "you should eat",
    now: "now",
    session: "per session",
    week: "a week",
    weeks: "weeks to target",
  },
  fr: {
    life: "Une journée normale, hors sport",
    sport: "Ce que tu t'entraînes vraiment",
    trips: "Les trajets que tu fais chaque semaine",
    goal: "Ce que tu vises",
    pick: "Choisis tes sports. Chacun se découpe en blocs, parce qu'une séance n'a pas une seule intensité.",
    addTrip: "Ajouter un trajet",
    from: "de",
    to: "à",
    perWeek: "allers-retours par semaine",
    distance: "km à l'aller",
    resolve: "Calculer la distance",
    save: "Enregistrer",
    apply: "Utiliser",
    applied: "Appliqué",
    rate: "kg par semaine",
    resting: "au repos",
    thermic: "digestion",
    dailyLife: "vie quotidienne",
    commute: "trajets",
    training: "entraînement",
    total: "tu brûles",
    target: "tu dois manger",
    now: "actuel",
    session: "par séance",
    week: "par semaine",
    weeks: "semaines jusqu'à la cible",
  },
} as const;

export function EnergyLab(p: Props) {
  const router = useRouter();
  const t = T[p.lang];
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [life, setLife] = useState<DailyLife>(p.dailyLife);
  const [goal, setGoal] = useState<GoalKind>(p.goalKind);
  const [sex, setSex] = useState<Sex>(p.sex);
  const [fat, setFat] = useState<string>(p.bodyFatPct?.toString() ?? "");
  const [rate, setRate] = useState<number>(p.savedRate);
  const [aim, setAim] = useState<number>(p.targetKg ?? Math.round(p.weightKg + 10));
  const [breakfasts, setBreakfasts] = useState<number>(p.breakfastDays);
  const [sessions, setSessions] = useState<Record<string, TrainingSession>>(() => {
    const out: Record<string, TrainingSession> = {};
    for (const s of p.sessions) out[s.sportId] = s;
    return out;
  });

  const list = useMemo(() => Object.values(sessions), [sessions]);
  const bodyFatPct = fat.trim() === "" ? null : Number(fat.replace(",", "."));
  const breakdown = tdee({
    body: {
      weightKg: p.weightKg,
      heightCm: p.heightCm,
      ageYears: p.ageYears,
      sex,
      bodyFatPct: Number.isFinite(bodyFatPct as number) ? bodyFatPct : null,
    },
    dailyLife: life,
    commutes: p.commutes,
    sessions: list,
    macros: p.macros ?? undefined,
    kcalGuess: p.currentTarget,
  });
  const plan = planFor(breakdown.total, p.weightKg, rate, aim, p.lang);
  const protein = proteinTarget(p.weightKg, goal);
  const delta = plan.targetKcal - p.currentTarget;

  // Tant que ce n'est pas enregistré, la projection en haut de page montre
  // l'ancien objectif. On le dit au lieu de laisser deux chiffres se contredire.
  const dirty =
    aim !== (p.targetKg ?? aim) ||
    Math.abs(rate - p.savedRate) > 0.001 ||
    breakfasts !== p.breakfastDays ||
    life !== p.dailyLife ||
    sex !== p.sex ||
    goal !== p.goalKind;

  function toggle(sportId: string) {
    setApplied(false);
    setSessions((prev) => {
      const next = { ...prev };
      if (next[sportId]) delete next[sportId];
      else next[sportId] = { sportId, perWeek: 3, blockMinutes: {} };
      return next;
    });
  }

  function tuneBlock(sportId: string, blockId: string, minutes: number) {
    setApplied(false);
    setSessions((prev) => {
      const cur = prev[sportId];
      if (!cur) return prev;
      const sport = sportById(sportId)!;
      const base = sessionMinutes(sport, cur);
      return { ...prev, [sportId]: { ...cur, blockMinutes: { ...base, [blockId]: minutes } } };
    });
  }

  function tunePerWeek(sportId: string, perWeek: number) {
    setApplied(false);
    setSessions((prev) => (prev[sportId] ? { ...prev, [sportId]: { ...prev[sportId]!, perWeek } } : prev));
  }

  async function save(apply: boolean) {
    setBusy(true);
    await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessions: list.map((s) => ({
          sportId: s.sportId,
          perWeek: s.perWeek,
          blockMinutes: sessionMinutes(sportById(s.sportId)!, s),
        })),
        dailyLife: life,
        goalKind: goal,
        sex,
        bodyFatPct: Number.isFinite(bodyFatPct as number) ? bodyFatPct : null,
        targetKg: aim,
        kgPerWeek: rate,
        breakfastDays: breakfasts,
      }),
    });
    if (apply) {
      await fetch("/api/training", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kcalTarget: plan.targetKcal, proteinG: protein }),
      });
      setApplied(true);
    }
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <Block
        title={p.lang === "fr" ? "Rythme des repas" : "Meal rhythm"}
        summary={
          p.lang === "fr"
            ? `Petit-déj ${dayCount(breakfasts, "fr")}`
            : `Breakfast ${dayCount(breakfasts, "en")}`
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {[0, 1, 2, 3, 5, 7].map((n) => (
            <Pill key={n} on={breakfasts === n} onClick={() => { setBreakfasts(n); setApplied(false); }}>
              {dayCount(n, p.lang)}
            </Pill>
          ))}
        </div>

      </Block>

      <Block
        title={t.life}
        summary={`${p.lang === "fr" ? DAILY_LIFE[life].labelFr : DAILY_LIFE[life].label}${
          bodyFatPct ? ` · ${bodyFatPct} % ${p.lang === "fr" ? "de masse grasse" : "body fat"}` : ""
        }`}
      >
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(DAILY_LIFE) as DailyLife[]).map((k) => (
            <Pill key={k} on={life === k} onClick={() => { setLife(k); setApplied(false); }}>
              {p.lang === "fr" ? DAILY_LIFE[k].labelFr : DAILY_LIFE[k].label}
            </Pill>
          ))}
          <label className="ml-2 flex items-center gap-2 text-[12px]" style={{ color: "var(--soft)" }}>
            {p.lang === "fr" ? "masse grasse %" : "body fat %"}
            <input
              value={fat}
              onChange={(e) => { setFat(e.target.value); setApplied(false); }}
              placeholder="—"
              inputMode="decimal"
              className="tabnum w-[62px] rounded-[6px] px-2 py-1.5 text-[14px] font-bold"
              style={{ background: "var(--surface2)", color: "var(--ink)" }}
            />
          </label>
        </div>

      </Block>

      <Block
        title={t.sport}
        summary={
          list.length === 0
            ? p.lang === "fr"
              ? "aucun sport renseigné"
              : "no sport yet"
            : `${list.map((x) => (p.lang === "fr" ? sportById(x.sportId)?.labelFr : sportById(x.sportId)?.label)).filter(Boolean).join(", ")} · ${Math.round(breakdown.training)} kcal/${p.lang === "fr" ? "jour" : "day"}`
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {SPORTS.map((s) => (
            <Pill key={s.id} on={Boolean(sessions[s.id])} onClick={() => toggle(s.id)}>
              {p.lang === "fr" ? s.labelFr : s.label}
            </Pill>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="mt-2 text-[13px]" style={{ color: "var(--soft)" }}>
            {t.pick}
          </p>
        ) : (
          <p className="mt-2 text-[12px]" style={{ color: "var(--soft)" }}>
            {p.lang === "fr" ? "×1 = assis sans rien faire. ×10 = un round de sparring." : "×1 = sitting still. ×10 = a sparring round."}
          </p>
        )}
        <div className="mt-3 flex flex-col gap-2">
          {list.map((s) => {
            const sport = sportById(s.sportId);
            if (!sport) return null;
            const mins = sessionMinutes(sport, s);
            const kcal = sessionKcal(sport, s, p.weightKg);
            const total = sessionTotalMinutes(sport, s);
            return (
              <div key={s.sportId} className="etal-card p-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[15px] font-bold">{p.lang === "fr" ? sport.labelFr : sport.label}</span>
                  <span className="text-[11.5px]" style={{ color: "var(--soft)" }}>
                    {p.lang === "fr" ? sport.noteFr : sport.note}
                  </span>
                  <span className="ml-auto flex items-center gap-2 text-[12px]" style={{ color: "var(--soft)" }}>
                    <input
                      type="number"
                      min={1}
                      max={14}
                      value={s.perWeek}
                      onChange={(e) => tunePerWeek(s.sportId, Math.max(1, Math.min(14, Number(e.target.value))))}
                      className="tabnum w-[52px] rounded-[6px] px-2 py-1 text-[14px] font-bold"
                      style={{ background: "var(--surface2)", color: "var(--ink)" }}
                    />
                    {p.lang === "fr" ? "par semaine" : "a week"}
                  </span>
                </div>

                <div className="mt-2 flex flex-col gap-1.5">
                  {sport.blocks.map((blk) => {
                    const m = mins[blk.id] ?? 0;
                    const share = total > 0 ? (m / total) * 100 : 0;
                    return (
                      <div key={blk.id} className="flex items-center gap-2.5">
                        <span className="w-[132px] shrink-0 text-[12.5px] font-semibold">
                          {p.lang === "fr" ? blk.labelFr : blk.label}
                        </span>
                        <span
                          className="h-2 flex-1 overflow-hidden rounded-full"
                          style={{ background: "var(--surface2)" }}
                        >
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${share}%`, background: metColor(blk.met) }}
                          />
                        </span>
                        <span
                          className="tabnum w-[46px] shrink-0 text-right text-[11px]"
                          style={{ color: "var(--soft)" }}
                          title={
                            p.lang === "fr"
                              ? `${blk.met} fois ta dépense au repos`
                              : `${blk.met} times what you burn sitting still`
                          }
                        >
                          ×{blk.met}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={300}
                          step={5}
                          value={m}
                          onChange={(e) => tuneBlock(s.sportId, blk.id, Math.max(0, Math.min(300, Number(e.target.value))))}
                          className="tabnum w-[58px] shrink-0 rounded-[6px] px-2 py-1 text-[13px] font-bold"
                          style={{ background: "var(--surface2)", color: "var(--ink)" }}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2 flex items-baseline gap-3 text-[12px]" style={{ color: "var(--soft)" }}>
                  <span className="display tabnum text-[18px]" style={{ color: "var(--ink)" }}>
                    {kcal} kcal
                  </span>
                  <span>
                    {t.session} · {total} min · {kcal * s.perWeek} {t.week}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Block>

      <Block
        title={t.trips}
        summary={
          p.commutes.length === 0
            ? p.lang === "fr"
              ? "aucun trajet"
              : "no trips yet"
            : `${p.commutes.map((c) => c.label).join(", ")} · ${Math.round(breakdown.commute)} kcal/${p.lang === "fr" ? "jour" : "day"}`
        }
      >
        <CommuteEditor commutes={p.commutes} lang={p.lang} weightKg={p.weightKg} />
      </Block>

      <Block
        title={t.goal}
        defaultOpen
        summary={`${p.lang === "fr" ? GOALS[goal].labelFr : GOALS[goal].label} · ${rate > 0 ? "+" : ""}${rate.toFixed(2)} kg/${p.lang === "fr" ? "sem" : "wk"} · ${aim} kg`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {(["f", "m"] as Sex[]).map((s) => (
            <Pill key={s} on={sex === s} onClick={() => { setSex(s); setApplied(false); }}>
              {s === "f" ? (p.lang === "fr" ? "Femme" : "Woman") : p.lang === "fr" ? "Homme" : "Man"}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["cut", "maintain", "bulk", "bulkFast"] as GoalKind[]).map((k) => {
            const label = p.lang === "fr" ? GOALS[k].labelFr : GOALS[k].label;
            return (
              <Pill
                key={k}
                on={goal === k}
                onClick={() => {
                  setGoal(k);
                  setRate(GOALS[k].kgPerWeek);
                  setAim(k === "cut" ? Math.round(p.weightKg - 5) : k === "maintain" ? Math.round(p.weightKg) : Math.round(p.weightKg + 10));
                  setApplied(false);
                }}
              >
                {label.charAt(0).toUpperCase() + label.slice(1)}
              </Pill>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--soft)" }}>
            {p.lang === "fr" ? "poids visé" : "target weight"}
            <input
              type="number"
              min={35}
              max={200}
              step={0.5}
              value={aim}
              onChange={(e) => { setAim(Number(e.target.value)); setApplied(false); }}
              className="tabnum w-[62px] rounded-[6px] px-2 py-1.5 text-[15px] font-bold"
              style={{ background: "var(--surface2)", color: "var(--ink)" }}
            />
            kg
          </label>
          <input
            type="range"
            min={-1}
            max={1.2}
            step={0.05}
            value={rate}
            onChange={(e) => { setRate(Number(e.target.value)); setApplied(false); }}
            className="etal-slider min-w-[180px] flex-1"
            style={{ "--c": rate >= 0 ? "var(--feuille)" : "var(--tomate)" } as React.CSSProperties}
            aria-label={t.rate}
          />
          <span className="tabnum w-[130px] text-right text-[16px] font-bold">
            {rate > 0 ? "+" : ""}
            {rate.toFixed(2)} {t.rate}
          </span>
        </div>
        {plan.warning ? (
          <p className="mt-2 text-[13px] font-semibold" style={{ color: "var(--curcuma)" }}>
            {plan.warning}
          </p>
        ) : null}
        {plan.weeksToGoal !== null ? (
          <p className="mt-1 text-[13px]" style={{ color: "var(--soft)" }}>
            {plan.weeksToGoal} {t.weeks} · {Math.round(plan.leanShare * 100)}%{" "}
            {p.lang === "fr" ? "de muscle attendu dans la prise" : "of the gain expected to be lean"}
          </p>
        ) : null}
      </Block>

      <div className="etal-card p-3">
        {/* Une seule barre au lieu de cinq nombres alignés : on voit la part de chaque poste. */}
        <div className="flex items-baseline gap-3">
          <span className="display tabnum text-[32px] leading-none">{breakdown.total}</span>
          <span className="text-[12px] font-semibold" style={{ color: "var(--soft)" }}>
            {t.total}
          </span>
        </div>
        <div className="mt-2 flex h-3 gap-[2px]">
          {POSTS.map((post) => {
            const v = breakdown[post.key];
            if (v <= 0) return null;
            return (
              <span
                key={post.key}
                style={{ width: `${(v / breakdown.total) * 100}%`, background: post.color, borderRadius: 999 }}
                title={`${v} kcal`}
              />
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {POSTS.map((post) => {
            const v = breakdown[post.key];
            if (v <= 0) return null;
            return (
              <span key={post.key} className="flex items-baseline gap-1.5 text-[12px]">
                <span className="h-2.5 w-2.5 self-center rounded-full" style={{ background: post.color }} aria-hidden />
                <span className="font-semibold">{t[post.key]}</span>
                <span className="tabnum" style={{ color: "var(--soft)" }}>
                  {v}
                </span>
              </span>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          <div>
            <div className="display tabnum text-[34px] leading-none" style={{ color: "var(--myrtille)" }}>
              {plan.targetKcal}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold" style={{ color: "var(--soft)" }}>
              {t.target} · {plan.deltaKcal > 0 ? "+" : ""}
              {plan.deltaKcal} kcal
            </div>
          </div>
          <div>
            <div className="display tabnum text-[22px] leading-none">{protein} g</div>
            <div className="mt-0.5 text-[11px] font-semibold" style={{ color: "var(--soft)" }}>
              {p.lang === "fr" ? "protéines par jour" : "protein a day"}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {dirty ? (
              <span
                className="rounded-full px-2.5 py-1 text-[12px] font-bold"
                style={{ background: "var(--curcuma)", color: "var(--on-color)" }}
              >
                {p.lang === "fr" ? "non enregistré" : "not saved yet"}
              </span>
            ) : null}
            {delta !== 0 ? (
              <span className="text-[12px] font-semibold" style={{ color: "var(--soft)" }}>
                {t.now} {p.currentTarget} ({delta > 0 ? "+" : ""}
                {delta})
              </span>
            ) : null}
            <button
              onClick={() => void save(false)}
              disabled={busy}
              className={dirty ? "etal-btn etal-btn--color text-[13px]" : "etal-btn text-[13px]"}
              style={dirty ? ({ "--c": "#c07a06" } as React.CSSProperties) : undefined}
            >
              {t.save}
            </button>
            <button
              onClick={() => void save(true)}
              disabled={busy || delta === 0}
              className="etal-btn etal-btn--color text-[13px]"
              style={{ "--c": "#2440c8" } as React.CSSProperties}
            >
              {applied ? t.applied : `${t.apply} ${plan.targetKcal}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommuteEditor({
  commutes,
  lang,
  weightKg,
}: {
  commutes: StoredCommute[];
  lang: "en" | "fr";
  weightKg: number;
}) {
  const router = useRouter();
  const t = T[lang];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState(lang === "fr" ? "École" : "School");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<CommuteMode>("walk");
  const [trips, setTrips] = useState(5);
  const [minutes, setMinutes] = useState<string>("");
  const [km, setKm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function edit(c: StoredCommute) {
    setEditing(c.id);
    setLabel(c.label);
    setFrom(c.fromAddress ?? "");
    setTo(c.toAddress ?? "");
    setMode(c.mode);
    setTrips(c.tripsPerWeek);
    setMinutes(c.minutesOneWay ? String(c.minutesOneWay) : "");
    setKm(c.km);
    setError(null);
    setOpen(true);
  }

  function fresh() {
    setEditing(null);
    setLabel(lang === "fr" ? "École" : "School");
    setFrom("");
    setTo("");
    setMode("walk");
    setTrips(5);
    setMinutes("");
    setKm(null);
    setError(null);
    setOpen(true);
  }

  async function add() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/commute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing ?? undefined,
        label,
        from,
        to,
        mode,
        tripsPerWeek: trips,
        minutesOneWay: minutes.trim() === "" ? null : Number(minutes),
        // Sur une modification sans changer d'adresse, on garde la distance connue.
        km: editing && from === "" && to === "" ? (km ?? undefined) : undefined,
      }),
    });
    if (!res.ok) {
      setError(lang === "fr" ? "Adresse introuvable. Précise la ville." : "Address not found. Add the city.");
      setBusy(false);
      return;
    }
    setOpen(false);
    setEditing(null);
    router.refresh();
    setBusy(false);
  }

  async function remove(id: string) {
    await fetch(`/api/commute?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {commutes.map((c) => {
        const m = COMMUTE_MODES[c.mode];
        const oneWay = c.minutesOneWay && c.minutesOneWay > 0 ? c.minutesOneWay : (c.km / m.kmh) * 60;
        const perWeek = Math.round(((m.met - 1) * 3.5 * weightKg / 200) * oneWay * 2 * c.tripsPerWeek);
        return (
          <div key={c.id} className="etal-card flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
            <span className="text-[14px] font-bold">{c.label}</span>
            <span className="text-[12px]" style={{ color: "var(--soft)" }}>
              {c.km} km · {Math.round(oneWay)} min {lang === "fr" ? "aller" : "each way"}
              {c.minutesOneWay ? (lang === "fr" ? " (le tien)" : " (yours)") : ""} ·{" "}
              {lang === "fr" ? m.labelFr : m.label} · {c.tripsPerWeek}× {t.week}
            </span>
            <span className="ml-auto display tabnum text-[17px]">{perWeek} kcal</span>
            <button
              onClick={() => edit(c)}
              className="text-[12px] font-semibold underline"
              style={{ color: "var(--myrtille)" }}
            >
              {lang === "fr" ? "modifier" : "edit"}
            </button>
            <button
              onClick={() => void remove(c.id)}
              className="text-[12px] font-semibold underline"
              style={{ color: "var(--soft)" }}
            >
              {lang === "fr" ? "retirer" : "remove"}
            </button>
          </div>
        );
      })}

      {open ? (
        <div className="etal-card flex flex-col gap-2 p-3">
          <div className="flex flex-wrap gap-2">
            <Field value={label} onChange={setLabel} placeholder={lang === "fr" ? "nom" : "name"} w={110} />
            <AddressField
              value={from}
              onChange={setFrom}
              placeholder={lang === "fr" ? "de : 41 rue de Vouillé" : "from: 41 rue de Vouillé"}
            />
            <AddressField
              value={to}
              onChange={setTo}
              placeholder={lang === "fr" ? "à : 96 boulevard Bessières" : "to: 96 boulevard Bessières"}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(COMMUTE_MODES) as CommuteMode[]).map((k) => (
              <Pill key={k} on={mode === k} onClick={() => setMode(k)}>
                {lang === "fr" ? COMMUTE_MODES[k].labelFr : COMMUTE_MODES[k].label}
              </Pill>
            ))}
            <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--soft)" }}>
              <input
                type="number"
                min={1}
                max={21}
                value={trips}
                onChange={(e) => setTrips(Math.max(1, Math.min(21, Number(e.target.value))))}
                className="tabnum w-[54px] rounded-[6px] px-2 py-1 text-[14px] font-bold"
                style={{ background: "var(--surface2)", color: "var(--ink)" }}
              />
              {t.perWeek}
            </label>
            <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--soft)" }}>
              <input
                type="number"
                min={1}
                max={240}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder={lang === "fr" ? "auto" : "auto"}
                className="tabnum w-[62px] rounded-[6px] px-2 py-1 text-[14px] font-bold"
                style={{ background: "var(--surface2)", color: "var(--ink)" }}
              />
              {lang === "fr" ? "min à l'aller" : "min each way"}
            </label>
            <button
              onClick={() => void add()}
              disabled={busy || (!editing && (!from || !to))}
              className="etal-btn etal-btn--color text-[13px]"
              style={{ "--c": "#137a42" } as React.CSSProperties}
            >
              {busy ? "…" : editing ? (lang === "fr" ? "Enregistrer" : "Save") : lang === "fr" ? "Ajouter" : "Add"}
            </button>
            <button onClick={() => setOpen(false)} className="etal-btn text-[13px]">
              {lang === "fr" ? "annuler" : "cancel"}
            </button>
          </div>
          {error ? (
            <p className="text-[12.5px] font-semibold" style={{ color: "var(--tomate)" }}>
              {error}
            </p>
          ) : null}
          <p className="text-[11.5px]" style={{ color: "var(--soft)" }}>
            {lang === "fr"
              ? "Distance par la route, adresses de la Base Adresse Nationale. Laisse la durée vide et elle se déduit du mode. Le vélo électrique est compté à 3,4 fois le repos : les mesures publiées vont de 3,1 à 5,7 selon l'assistance, et avec une assistance forte on pédale à peine."
              : "Road distance, addresses from the French national address base. Leave the duration empty and it comes from the mode. Electric bikes are counted at 3.4× resting: published measurements run 3.1 to 5.7 depending on assist, and on high assist you barely pedal."}
          </p>
        </div>
      ) : (
        <button onClick={fresh} className="etal-btn w-fit text-[13px]">
          {t.addTrip}
        </button>
      )}
    </div>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  w,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  w: number;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ background: "var(--surface2)", color: "var(--ink)", width: w }}
      className="rounded-[6px] px-2.5 py-1.5 text-[13.5px] font-semibold"
    />
  );
}

/**
 * Une section qui s'ouvre à la demande, avec son résumé sur la ligne fermée.
 * L'écran affiche donc quatre lignes au repos au lieu de quatre blocs déroulés.
 */
function Block({
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  title: string;
  summary?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="etal-card overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold">{title}</span>
          {summary ? (
            <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: "var(--soft)" }}>
              {summary}
            </span>
          ) : null}
        </span>
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-transform duration-200"
          style={{ background: "var(--surface2)", transform: open ? "rotate(180deg)" : "none" }}
          aria-hidden
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open ? <div className="border-t px-3 pb-3 pt-3" style={{ borderColor: "var(--line)" }}>{children}</div> : null}
    </section>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors"
      style={{ background: on ? "var(--myrtille)" : "var(--surface2)", color: on ? "#fff" : "var(--ink)" }}
    >
      {children}
    </button>
  );
}

/** Les cinq postes de la dépense, dans l'ordre où ils pèsent. */
const POSTS = [
  { key: "resting", color: "#565a4e" },
  { key: "dailyLife", color: "#137a42" },
  { key: "commute", color: "#2440c8" },
  { key: "training", color: "#d63127" },
  { key: "thermic", color: "#c07a06" },
] as const;

/** Une couleur par intensité : on voit d'un coup d'oeil ce qui coûte dans une séance. */
/** « 1 day », pas « 1 days ». */
function dayCount(n: number, lang: "en" | "fr"): string {
  if (n === 0) return lang === "fr" ? "jamais" : "never";
  if (n === 7) return lang === "fr" ? "tous les jours" : "every day";
  const unit = lang === "fr" ? (n > 1 ? "jours" : "jour") : n > 1 ? "days" : "day";
  return `${n} ${unit}`;
}

function metColor(met: number): string {
  if (met >= 9) return "var(--tomate)";
  if (met >= 6.5) return "var(--curcuma)";
  if (met >= 4) return "var(--feuille)";
  return "var(--soft)";
}
