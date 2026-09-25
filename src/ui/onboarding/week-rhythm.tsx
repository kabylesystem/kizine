"use client";

import { useState } from "react";
import type { DayContext, DayPlanDraft } from "./types";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const CONTEXTS: { id: DayContext; label: string; color: string; hint: string }[] = [
  { id: "flexible", label: "Depends", color: "#565a4e", hint: "you decide on the day" },
  { id: "home", label: "Home", color: "#137a42", hint: "you can cook whenever" },
  { id: "school", label: "Out all day", color: "#2440c8", hint: "lunch has to travel" },
  { id: "away", label: "Busy", color: "#4d2880", hint: "minimum cooking" },
];

const MINUTES: Record<DayContext, number> = { flexible: 40, home: 55, school: 35, away: 20 };

/** Par défaut tout est « ça dépend » : personne ne connaît sa semaine trois mois à l'avance. */
const defaults: DayPlanDraft[] = DAYS.map((label, weekday) => ({
  weekday,
  label,
  context: "flexible",
  meals: 3,
  cookMinutes: 40,
}));

interface Props {
  onDone: (days: DayPlanDraft[], shoppingWeekday: number) => void;
  initialDays?: DayPlanDraft[];
  initialShopping?: number;
}

export function WeekRhythm({ onDone, initialDays, initialShopping }: Props) {
  const [days, setDays] = useState<DayPlanDraft[]>(initialDays?.length === 7 ? initialDays : defaults);
  const [shopping, setShopping] = useState(initialShopping ?? 2);
  const [open, setOpen] = useState(false);

  const set = (weekday: number, patch: Partial<DayPlanDraft>) =>
    setDays((d) => d.map((x) => (x.weekday === weekday ? { ...x, ...patch } : x)));

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-4">
      <div className="etal-card p-4">
        <h3 className="mb-1 text-[17px] font-bold">You don&apos;t have to know your week in advance</h3>
        <p className="text-[14px]" style={{ color: "var(--soft)" }}>
          Every day starts as <b style={{ color: "var(--ink)" }}>Depends</b>: meals that travel, a sane cooking time.
          Each morning the app asks where you are and re-plans that day in one tap. Fill this in only if some days are
          genuinely fixed.
        </p>
      </div>

      <div className="etal-card p-4">
        <div className="mb-2 text-[14px] font-bold">Shopping day</div>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => (
            <button
              key={d}
              onClick={() => setShopping(i)}
              className="rounded-md px-3 py-2 text-[13px] font-bold transition-all duration-150 hover:-translate-y-0.5"
              style={{
                background: shopping === i ? "#137a42" : "var(--surface2)",
                color: shopping === i ? "#fff" : "var(--soft)",
              }}
            >
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px]" style={{ color: "var(--soft)" }}>
          Fresh fish and salads land right after, sturdy things at the end of the week.
        </p>
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="text-left text-[13px] font-semibold underline-offset-4 hover:underline"
        style={{ color: "var(--soft)" }}
      >
        {open ? "Hide the day by day detail" : "Some days are always the same? Set them here"}
      </button>

      {open ? (
        <div className="flex flex-col gap-2">
          {days.map((d) => {
            const ctx = CONTEXTS.find((c) => c.id === d.context)!;
            return (
              <div key={d.weekday} className="etal-card p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-[92px] shrink-0 text-[15px] font-bold">{d.label}</div>

                  <div className="flex flex-wrap gap-1">
                    {CONTEXTS.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => set(d.weekday, { context: c.id, cookMinutes: MINUTES[c.id] })}
                        title={c.hint}
                        className="rounded-md px-2.5 py-1.5 text-[12px] font-bold transition-all duration-150 hover:-translate-y-0.5"
                        style={{
                          background: d.context === c.id ? c.color : "var(--surface2)",
                          color: d.context === c.id ? "#fff" : "var(--soft)",
                        }}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-1">
                    {[2, 3, 4].map((m) => (
                      <button
                        key={m}
                        onClick={() => set(d.weekday, { meals: m as 2 | 3 | 4 })}
                        className="h-8 w-9 rounded-md text-[13px] font-bold transition-all duration-150 hover:-translate-y-0.5"
                        style={{
                          background: d.meals === m ? "var(--ink)" : "var(--surface2)",
                          color: d.meals === m ? "var(--ground)" : "var(--soft)",
                        }}
                      >
                        {m}
                      </button>
                    ))}
                    <span className="self-center pl-1 text-[11px] font-semibold" style={{ color: "var(--soft)" }}>
                      meals
                    </span>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={90}
                      step={5}
                      value={d.cookMinutes}
                      onChange={(e) => set(d.weekday, { cookMinutes: Number(e.target.value) })}
                      className="w-[110px] accent-[var(--tomate)]"
                      aria-label={`cooking minutes on ${d.label}`}
                    />
                    <span className="tabnum w-[52px] text-right text-[13px] font-bold">{d.cookMinutes} min</span>
                  </div>
                </div>
                <div className="mt-1 text-[11px]" style={{ color: "var(--soft)" }}>
                  {ctx.hint}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <button
        className="etal-btn etal-btn--color"
        style={{ "--c": "#2440c8" } as React.CSSProperties}
        onClick={() => onDone(days, shopping)}
      >
        {open ? "Next" : "My week changes, decide day by day"}
      </button>
    </div>
  );
}
