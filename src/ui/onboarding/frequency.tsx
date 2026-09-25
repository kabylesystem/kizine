"use client";

import { useState } from "react";
import type { DeckCard } from "./types";

interface Props {
  loved: DeckCard[];
  initial?: Record<string, number>;
  onDone: (frequency: Record<string, number>) => void;
}

const STEPS = [1, 2, 3, 4, 5, 7];

export function Frequency({ loved, onDone, initial }: Props) {
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(loved.map((c) => [c.id, initial?.[c.id] ?? 3])),
  );

  return (
    <div className="flex w-full max-w-[560px] flex-col gap-4">
      <p className="text-[15px]" style={{ color: "var(--soft)" }}>
        You love these. How many times a week before you get bored of them?
      </p>
      <div className="flex flex-col gap-2">
        {loved.map((c) => {
          const value = values[c.id] ?? 3;
          return (
            <div key={c.id} className="etal-card flex items-center gap-3 p-3">
              {c.image ? (
                <img src={c.image} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-md" style={{ background: "var(--surface2)" }} />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold">{c.nameEn}</div>
                <div className="mt-1.5 flex gap-1">
                  {STEPS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setValues((v) => ({ ...v, [c.id]: s }))}
                      className="h-8 flex-1 rounded-md text-[13px] font-bold transition-all duration-150 hover:-translate-y-0.5"
                      style={{
                        background: value === s ? "var(--tomate)" : "var(--surface2)",
                        color: value === s ? "var(--on-color)" : "var(--soft)",
                      }}
                    >
                      {s === 7 ? "daily" : s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <button className="etal-btn etal-btn--color" style={{ "--c": "#d63127" } as React.CSSProperties} onClick={() => onDone(values)}>
        Next
      </button>
    </div>
  );
}
