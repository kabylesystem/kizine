"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DayBalance } from "@/server/day-balance";

const SLOT_LABEL: Record<string, string> = {
  breakfast: "breakfast",
  lunch: "lunch",
  snack: "snack",
  dinner: "dinner",
};

/**
 * Quand un repas saute, la journée tombe sous sa cible. Plutôt que de laisser
 * le compteur mentir, on nomme le trou et on propose de le combler sur un repas
 * encore à faire : même plat, portion plus grande, recalculée par le solveur.
 */
export function DayGap({ balance, lang }: { balance: DayBalance; lang: "en" | "fr" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const fr = lang === "fr";

  // Sous cent kcal, ce n'est pas un trou, c'est l'arrondi du solveur.
  if (balance.gapKcal < 100 || balance.open.length === 0) return null;

  async function fill(slotId: string) {
    setBusy(slotId);
    const res = await fetch("/api/rebalance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, addKcal: balance.gapKcal }),
    });
    const data = (await res.json().catch(() => ({}))) as { gained?: number; short?: number };
    if (data.gained !== undefined) {
      setNote(
        data.short && data.short > 80
          ? fr
            ? `+${data.gained} kcal, il reste ${data.short} que cette assiette ne peut pas porter`
            : `+${data.gained} kcal, ${data.short} more than this plate can carry`
          : fr
            ? `+${data.gained} kcal, la journée est complète`
            : `+${data.gained} kcal, the day is whole again`,
      );
      setTimeout(() => setNote(null), 5000);
    }
    router.refresh();
    setBusy(null);
  }

  const cause = balance.skipped[0];

  return (
    <div className="mb-3 rounded-[7px] p-3" style={{ background: "var(--curcuma)", color: "var(--on-color)" }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="display tabnum text-[24px] leading-none">−{balance.gapKcal}</span>
        <span className="text-[13.5px] font-bold">
          {fr ? "kcal manquantes aujourd'hui" : "kcal missing today"}
        </span>
        {cause ? (
          <span className="text-[12.5px] opacity-85">
            {fr ? "depuis que tu as sauté" : "since you skipped"} {cause.title}
            {cause.reason ? ` (${cause.reason})` : ""}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold opacity-90">
          {fr ? "Rattraper sur" : "Make it up on"}
        </span>
        {balance.open.map((o) => (
          <button
            key={o.slotId}
            onClick={() => void fill(o.slotId)}
            disabled={busy !== null}
            className="rounded-full bg-black/25 px-3 py-1.5 text-[13px] font-bold transition-opacity hover:opacity-80"
          >
            {busy === o.slotId ? "…" : `${SLOT_LABEL[o.slot] ?? o.slot} · ${o.kcal} kcal`}
          </button>
        ))}
      </div>
      {note ? <p className="mt-2 text-[12.5px] font-bold">{note}</p> : null}
    </div>
  );
}
