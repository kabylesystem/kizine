"use client";

import { useMemo, useState } from "react";
import { SPORTS, sessionKcal, sessionTotalMinutes, sportById, type TrainingSession } from "@/core/training";
import {
  COMMUTE_MODES,
  DAILY_LIFE,
  tdee,
  type Commute,
  type CommuteMode,
  type DailyLife,
  type Sex,
} from "@/core/tdee";
import { AddressField } from "../address-field";

export interface EnergyValues {
  dailyLife: DailyLife;
  sessions: TrainingSession[];
  commutes: (Commute & { label: string; from?: string; to?: string })[];
}

interface Props {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
  initial?: EnergyValues;
  onDone: (v: EnergyValues, maintenanceKcal: number) => void;
}

/**
 * Version courte du calculateur, pour l'onboarding. Mêmes formules que Numbers,
 * mais on ne règle pas les blocs un par un : les durées par défaut de chaque
 * sport suffisent à démarrer, et tout reste modifiable ensuite.
 */
export function EnergyStep({ weightKg, heightCm, ageYears, sex, initial, onDone }: Props) {
  const [life, setLife] = useState<DailyLife>(initial?.dailyLife ?? "mixed");
  const [sessions, setSessions] = useState<Record<string, TrainingSession>>(() => {
    const out: Record<string, TrainingSession> = {};
    for (const s of initial?.sessions ?? []) out[s.sportId] = s;
    return out;
  });
  const [commutes, setCommutes] = useState<EnergyValues["commutes"]>(initial?.commutes ?? []);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("School");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<CommuteMode>("walk");
  const [trips, setTrips] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => Object.values(sessions), [sessions]);
  const breakdown = tdee({
    body: { weightKg, heightCm, ageYears, sex },
    dailyLife: life,
    commutes,
    sessions: list,
  });

  function toggle(sportId: string) {
    setSessions((prev) => {
      const next = { ...prev };
      if (next[sportId]) delete next[sportId];
      else next[sportId] = { sportId, perWeek: 3, blockMinutes: {} };
      return next;
    });
  }

  async function addTrip() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/geo?q=${encodeURIComponent(from)}`);
      const a = (await res.json()) as { results: { lat: number; lon: number }[] };
      const res2 = await fetch(`/api/geo?q=${encodeURIComponent(to)}`);
      const b = (await res2.json()) as { results: { lat: number; lon: number }[] };
      if (!a.results[0] || !b.results[0]) {
        setError("Address not found. Pick one from the list.");
        return;
      }
      const r = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${a.results[0].lon},${a.results[0].lat};${b.results[0].lon},${b.results[0].lat}?overview=false`,
      );
      const route = (await r.json()) as { code: string; routes?: { distance: number }[] };
      const km = route.code === "Ok" && route.routes?.[0] ? route.routes[0].distance / 1000 : null;
      if (km === null) {
        setError("No route between those two.");
        return;
      }
      setCommutes((c) => [
        ...c,
        { label, from, to, mode, km: Math.round(km * 100) / 100, tripsPerWeek: trips },
      ]);
      setAdding(false);
      setFrom("");
      setTo("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full max-w-[720px] flex-col gap-5">
      <Group title="A normal day, outside sport">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(DAILY_LIFE) as DailyLife[]).map((k) => (
            <Pill key={k} on={life === k} onClick={() => setLife(k)}>
              {DAILY_LIFE[k].label}
            </Pill>
          ))}
        </div>
      </Group>

      <Group title="What you train, and how often">
        <div className="flex flex-wrap gap-1.5">
          {SPORTS.map((s) => (
            <Pill key={s.id} on={Boolean(sessions[s.id])} onClick={() => toggle(s.id)}>
              {s.label}
            </Pill>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {list.map((s) => {
            const sport = sportById(s.sportId);
            if (!sport) return null;
            return (
              <div key={s.sportId} className="etal-card flex flex-wrap items-center gap-3 p-3">
                <span className="text-[14px] font-bold">{sport.label}</span>
                <span className="text-[11.5px]" style={{ color: "var(--soft)" }}>
                  {sport.note}
                </span>
                <label className="ml-auto flex items-center gap-2 text-[12px]" style={{ color: "var(--soft)" }}>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={s.perWeek}
                    onChange={(e) =>
                      setSessions((prev) => ({
                        ...prev,
                        [s.sportId]: { ...prev[s.sportId]!, perWeek: Math.max(1, Math.min(14, Number(e.target.value))) },
                      }))
                    }
                    className="tabnum w-[52px] rounded-[6px] px-2 py-1 text-[14px] font-bold"
                    style={{ background: "var(--surface2)", color: "var(--ink)" }}
                  />
                  a week
                </label>
                <span className="display tabnum text-[16px]">
                  {sessionKcal(sport, s, weightKg)} kcal
                </span>
                <span className="text-[11px]" style={{ color: "var(--soft)" }}>
                  {sessionTotalMinutes(sport, s)} min
                </span>
              </div>
            );
          })}
        </div>
        {list.length > 0 ? (
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--soft)" }}>
            A session is split into warm-up, work and rest, each at its own intensity. Five yoga classes
            and five MMA sessions are not the same burn, and this knows it.
          </p>
        ) : null}
      </Group>

      <Group title="Trips you make every week">
        <div className="flex flex-col gap-1.5">
          {commutes.map((c, i) => (
            <div key={`${c.label}-${i}`} className="etal-card flex flex-wrap items-center gap-3 p-3">
              <span className="text-[14px] font-bold">{c.label}</span>
              <span className="text-[12px]" style={{ color: "var(--soft)" }}>
                {c.km} km · {COMMUTE_MODES[c.mode].label} · {c.tripsPerWeek}× a week
              </span>
              <button
                onClick={() => setCommutes((list) => list.filter((_, j) => j !== i))}
                className="ml-auto text-[12px] font-semibold underline"
                style={{ color: "var(--soft)" }}
              >
                remove
              </button>
            </div>
          ))}
        </div>
        {adding ? (
          <div className="etal-card mt-2 flex flex-col gap-2 p-3">
            <div className="flex flex-wrap gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="name"
                className="w-[110px] rounded-[6px] px-2.5 py-2 text-[13.5px] font-semibold"
                style={{ background: "var(--surface2)", color: "var(--ink)" }}
              />
              <AddressField value={from} onChange={setFrom} placeholder="from: your street" width={220} />
              <AddressField value={to} onChange={setTo} placeholder="to: where you go" width={220} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(COMMUTE_MODES) as CommuteMode[]).map((k) => (
                <Pill key={k} on={mode === k} onClick={() => setMode(k)}>
                  {COMMUTE_MODES[k].label}
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
                return trips a week
              </label>
              <button
                onClick={() => void addTrip()}
                disabled={busy || !from || !to}
                className="etal-btn etal-btn--color text-[13px]"
                style={{ "--c": "#137a42" } as React.CSSProperties}
              >
                {busy ? "…" : "Add"}
              </button>
              <button onClick={() => setAdding(false)} className="etal-btn text-[13px]">
                cancel
              </button>
            </div>
            {error ? (
              <p className="text-[12.5px] font-semibold" style={{ color: "var(--tomate)" }}>
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="etal-btn mt-2 w-fit text-[13px]">
            Add a trip
          </button>
        )}
      </Group>

      <div className="etal-card p-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <span className="display tabnum text-[34px] leading-none">{breakdown.total}</span>
          <span className="text-[13px] font-semibold" style={{ color: "var(--soft)" }}>
            kcal you burn on an average day
          </span>
        </div>
        <div className="mt-2 flex h-3 gap-[2px]">
          {(
            [
              ["resting", "#565a4e"],
              ["dailyLife", "#137a42"],
              ["commute", "#2440c8"],
              ["training", "#d63127"],
              ["thermic", "#c07a06"],
            ] as const
          ).map(([key, color]) => {
            const v = breakdown[key];
            if (v <= 0) return null;
            return (
              <span
                key={key}
                style={{ width: `${(v / breakdown.total) * 100}%`, background: color, borderRadius: 999 }}
              />
            );
          })}
        </div>
        <p className="mt-2 text-[12px]" style={{ color: "var(--soft)" }}>
          Resting burn {breakdown.resting} · daily life {breakdown.dailyLife} · trips {breakdown.commute} ·
          training {breakdown.training} · digesting food {breakdown.thermic}. Formula:{" "}
          {breakdown.formula === "katch-mcardle" ? "Katch-McArdle" : "Mifflin-St Jeor"}, plus METs from the
          Compendium of Physical Activities.
        </p>
      </div>

      <button
        onClick={() => onDone({ dailyLife: life, sessions: list, commutes }, breakdown.total)}
        className="etal-btn etal-btn--color self-center text-[16px]"
        style={{ "--c": "#137a42" } as React.CSSProperties}
      >
        Use this
      </button>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="w-full">
      <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider" style={{ color: "var(--soft)" }}>
        {title}
      </h3>
      {children}
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
