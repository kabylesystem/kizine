"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const OPTIONS = [
  { id: "home", label: "Home", full: "At home", color: "#137a42", hint: "you cook on the spot, dinner can take its time" },
  { id: "school", label: "Out", full: "Out all day", color: "#2440c8", hint: "lunch is made the night before and travels: sandwich, box, nothing to reheat" },
  { id: "away", label: "Busy", full: "Busy", color: "#4d2880", hint: "dinner capped at 20 minutes, lunch still travels" },
] as const;

/**
 * Un tap doit répondre tout de suite. On peint le nouvel état AVANT la réponse
 * du serveur et on revient en arrière si l'appel échoue : le calcul dure une
 * seconde, l'interface n'a pas à la faire attendre.
 */
export function DayContext({
  date,
  current,
  noSnack = false,
  compact = false,
}: {
  date: string;
  current: string | null;
  noSnack?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState(current);
  const [snackOff, setSnackOff] = useState(noSnack);

  function send(body: Record<string, unknown>, revert: () => void) {
    startTransition(async () => {
      const res = await fetch("/api/day-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, ...body }),
      });
      if (!res.ok) revert();
      router.refresh();
    });
  }

  function pick(context: string) {
    if (context === active) return;
    const before = active;
    setActive(context);
    send({ context }, () => setActive(before));
  }

  function toggleSnack() {
    const next = !snackOff;
    setSnackOff(next);
    send({ noSnack: next }, () => setSnackOff(!next));
  }

  const size = compact
    ? "flex-1 rounded-md py-1 text-[10.5px]"
    : "rounded-md px-3 py-1.5 text-[13px]";

  const buttons = (
    <>
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => pick(o.id)}
          title={`${o.full} · ${o.hint}`}
          className={`${size} font-bold transition-all duration-150 hover:-translate-y-0.5`}
          style={{
            background: active === o.id ? o.color : "var(--surface2)",
            color: active === o.id ? "#fff" : "var(--soft)",
            opacity: pending ? 0.75 : 1,
          }}
        >
          {compact ? o.label : o.full}
        </button>
      ))}
      <button
        onClick={toggleSnack}
        title={snackOff ? "put the snack back on this day" : "drop the snack on this day, its calories move to lunch and dinner"}
        className={`${size} shrink-0 font-bold transition-all duration-150 hover:-translate-y-0.5`}
        style={{
          background: snackOff ? "#c07a06" : "var(--surface2)",
          color: snackOff ? "#fff" : "var(--soft)",
          opacity: pending ? 0.75 : 1,
          flex: compact ? "0 0 auto" : undefined,
          paddingLeft: compact ? 7 : undefined,
          paddingRight: compact ? 7 : undefined,
        }}
      >
        NS
      </button>
    </>
  );

  if (compact) return <div className="flex gap-1">{buttons}</div>;

  const today = new Date().toISOString().slice(0, 10);
  const question = date === today ? "Where are you today?" : date > today ? "Where will you be?" : "Where were you?";

  return (
    <div className="etal-card mt-4 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-bold">{question}</span>
        <div className="flex flex-wrap gap-1.5">{buttons}</div>
        <span className="ml-auto text-[12px]" style={{ color: "var(--soft)" }}>
          {active === "away"
            ? "Busy: dinner under 20 min, lunch travels"
            : active === "school"
              ? "Out: lunch made the night before"
              : "NS drops the snack for this day"}
        </span>
      </div>
    </div>
  );
}
