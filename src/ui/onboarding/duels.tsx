"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DuelDish } from "./types";
import { cuisineLabel } from "@/core/cuisines";

const K = 32;
const TOTAL = 22;

function expected(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/** Paires les plus informatives : Elo proche, et on évite de rejouer une paire. */
function pickPair(
  dishes: DuelDish[],
  elo: Record<string, number>,
  seen: Set<string>,
  seenDishes: Map<string, number>,
): [DuelDish, DuelDish] | null {
  const sorted = [...dishes].sort(
    (a, b) => (seenDishes.get(a.id) ?? 0) - (seenDishes.get(b.id) ?? 0) || Math.random() - 0.5,
  );
  const pool = sorted.slice(0, Math.max(12, Math.floor(dishes.length / 2)));
  let best: [DuelDish, DuelDish] | null = null;
  let bestGap = Infinity;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!;
      const b = pool[j]!;
      const key = [a.id, b.id].sort().join("|");
      if (seen.has(key)) continue;
      if (a.cuisine === b.cuisine) continue;
      const gap = Math.abs((elo[a.id] ?? 1500) - (elo[b.id] ?? 1500));
      if (gap < bestGap) {
        bestGap = gap;
        best = [a, b];
      }
    }
  }
  return best;
}

interface Props {
  dishes: DuelDish[];
  onDone: (elo: Record<string, number>, duels: { left: string; right: string; winner: string }[]) => void;
}

const DUEL_KEY = "semoule:duels";
const DUEL_LEGACY = "etal:duels";

interface DuelSave {
  elo: Record<string, number>;
  duels: { left: string; right: string; winner: string }[];
  round: number;
  seen: string[];
  seenDishes: [string, number][];
}

function readDuels(): DuelSave | null {
  if (typeof window === "undefined") return null;
  try {
    const fresh = window.localStorage.getItem(DUEL_KEY);
    const raw = fresh ?? window.localStorage.getItem(DUEL_LEGACY);
    return raw ? (JSON.parse(raw) as DuelSave) : null;
  } catch {
    return null;
  }
}

export function Duels({ dishes, onDone }: Props) {
  const [elo, setElo] = useState<Record<string, number>>({});
  const [duels, setDuels] = useState<{ left: string; right: string; winner: string }[]>([]);
  const [seen] = useState(() => new Set<string>());
  const [seenDishes] = useState(() => new Map<string, number>());
  const [round, setRound] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    const saved = readDuels();
    if (saved && saved.round > 0) {
      setElo(saved.elo);
      setDuels(saved.duels);
      for (const k of saved.seen) seen.add(k);
      for (const [k, v] of saved.seenDishes) seenDishes.set(k, v);
      setRound(saved.round);
      if (saved.round >= TOTAL) setReviewing(true);
    }
    setRestored(true);
  }, [seen, seenDishes]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(
        DUEL_KEY,
        JSON.stringify({ elo, duels, round, seen: [...seen], seenDishes: [...seenDishes] } satisfies DuelSave),
      );
    } catch {
      /* mode privé : on continue sans sauvegarde */
    }
  }, [elo, duels, round, restored, seen, seenDishes]);

  const pair = useMemo(
    () => (restored ? pickPair(dishes, elo, seen, seenDishes) : null),
    [dishes, round, restored],
  );

  const choose = useCallback(
    (winnerId: string) => {
      if (!pair || chosen) return;
      const [a, b] = pair;
      const loserId = winnerId === a.id ? b.id : a.id;
      setChosen(winnerId);
      if ("vibrate" in navigator) navigator.vibrate(10);

      window.setTimeout(() => {
        const ra = elo[winnerId] ?? 1500;
        const rb = elo[loserId] ?? 1500;
        const ea = expected(ra, rb);
        setElo((prev) => ({
          ...prev,
          [winnerId]: Math.round(ra + K * (1 - ea)),
          [loserId]: Math.round(rb + K * (0 - (1 - ea))),
        }));
        setDuels((d) => [...d, { left: a.id, right: b.id, winner: winnerId }]);
        seen.add([a.id, b.id].sort().join("|"));
        seenDishes.set(a.id, (seenDishes.get(a.id) ?? 0) + 1);
        seenDishes.set(b.id, (seenDishes.get(b.id) ?? 0) + 1);
        setChosen(null);
        setRound((r) => r + 1);
      }, 260);
    },
    [pair, chosen, elo, seen, seenDishes],
  );

  useEffect(() => {
    if (!restored || reviewing) return;
    if (round >= TOTAL || !pair) {
      if (round > 0) onDone(elo, duels);
    }
  }, [round, pair, elo, duels, onDone, restored, reviewing]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!pair) return;
      if (e.key === "ArrowLeft" || e.key === "1") {
        e.preventDefault();
        choose(pair[0].id);
      }
      if (e.key === "ArrowRight" || e.key === "2") {
        e.preventDefault();
        choose(pair[1].id);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [pair, choose]);

  if (reviewing) {
    return (
      <div className="flex w-full max-w-[520px] flex-col gap-3">
        <div className="etal-card p-4">
          <h3 className="mb-1 text-[18px] font-bold">Duels already done</h3>
          <p className="text-[14px]" style={{ color: "var(--soft)" }}>
            {duels.length} choices recorded. Your dish ranking is saved.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="etal-btn etal-btn--color flex-1"
            style={{ "--c": "#ab1565" } as React.CSSProperties}
            onClick={() => onDone(elo, duels)}
          >
            Keep these
          </button>
          <button
            className="etal-btn etal-btn--quiet"
            onClick={() => {
              seen.clear();
              seenDishes.clear();
              setElo({});
              setDuels([]);
              setRound(0);
              setReviewing(false);
            }}
          >
            Play again
          </button>
        </div>
      </div>
    );
  }

  if (!pair) return null;

  return (
    <div className="flex w-full max-w-[820px] flex-col items-center gap-5">
      <div className="w-full">
        <div className="mb-2 flex items-baseline justify-between text-[13px] font-semibold" style={{ color: "var(--soft)" }}>
          <span>
            Duel {Math.min(round + 1, TOTAL)} / {TOTAL}
          </span>
          <span>Which one tonight?</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface2)" }}>
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${(round / TOTAL) * 100}%`, background: "var(--betterave)" }}
          />
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-3 sm:gap-4">
        {pair.map((dish, i) => (
          <button
            key={dish.id}
            onClick={() => choose(dish.id)}
            className="group relative aspect-[3/4] overflow-hidden rounded-[10px] text-left transition-all duration-200 hover:-translate-y-1 sm:aspect-[4/5]"
            style={{
              background: i === 0 ? "#2440c8" : "#ab1565",
              opacity: chosen && chosen !== dish.id ? 0.35 : 1,
              transform: chosen === dish.id ? "scale(1.03)" : undefined,
              boxShadow: chosen === dish.id ? "0 24px 50px -26px rgb(20 22 15 / 0.6)" : undefined,
            }}
          >
            {dish.image ? (
              <img src={dish.image} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            ) : null}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(180deg, rgb(20 22 15 / 0.1) 25%, rgb(20 22 15 / 0.82) 85%)`,
              }}
            />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <div className="display text-[24px] leading-[1] text-white sm:text-[30px]">{dish.title}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-white/22 px-2 py-0.5 text-[11px] font-bold text-white">{cuisineLabel(dish.cuisine)}</span>
                <span className="rounded-full bg-white/22 px-2 py-0.5 text-[11px] font-bold text-white">{dish.activeMinutes} min</span>
              </div>
            </div>
            <span className="absolute left-3 top-3 rounded-md bg-black/40 px-2 py-1 text-[11px] font-bold text-white">
              {i === 0 ? "←" : "→"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
