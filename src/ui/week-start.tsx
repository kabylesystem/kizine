"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * Le calendrier commence lundi ; un cycle de courses commence le jour où l'on
 * fait les courses. C'est à lui de choisir.
 */
export function WeekStart({
  current,
  shoppingWeekday,
  weekStart,
  lang,
}: {
  current: number;
  shoppingWeekday: number;
  /** Semaine affichée, pour amorcer le sélecteur de date. */
  weekStart: string;
  lang: "en" | "fr";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const days = lang === "fr" ? DAYS_FR : DAYS_EN;

  async function set(weekday: number, goTo?: string) {
    setBusy(true);
    await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: [], weekStartsOn: weekday }),
    });
    setOpen(false);
    router.replace(goTo ? `/week?w=${goTo}` : "/week");
    router.refresh();
    setBusy(false);
  }

  /** Choisir une date exacte fixe aussi le jour de redémarrage du cycle. */
  async function setFromDate(iso: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    await set(new Date(`${iso}T00:00:00Z`).getUTCDay(), iso);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="etal-btn etal-btn--quiet text-[14px]">
        {lang === "fr" ? "Commencer quel jour ?" : "Start which day?"}
      </button>
    );
  }

  return (
    <div className="etal-card flex w-full flex-wrap items-center gap-2 p-3">
      <span className="text-[13px] font-bold">
        {lang === "fr" ? "La semaine commence le" : "The week starts on"}
      </span>
      {days.map((d, i) => (
        <button
          key={d}
          disabled={busy}
          onClick={() => void set(i)}
          className="rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors"
          style={{
            background: i === current ? "var(--myrtille)" : "var(--surface2)",
            color: i === current ? "#fff" : "var(--ink)",
          }}
        >
          {d}
          {i === shoppingWeekday ? " 🛒" : ""}
        </button>
      ))}
      <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--soft)" }}>
        {lang === "fr" ? "ou à cette date" : "or on this exact date"}
        <input
          type="date"
          defaultValue={weekStart}
          onChange={(e) => void setFromDate(e.target.value)}
          disabled={busy}
          className="rounded-[6px] px-2 py-1.5 text-[13px] font-bold"
          style={{ background: "var(--surface2)", color: "var(--ink)" }}
        />
      </label>
      <button onClick={() => setOpen(false)} className="etal-btn text-[13px]">
        {lang === "fr" ? "fermer" : "close"}
      </button>
    </div>
  );
}
