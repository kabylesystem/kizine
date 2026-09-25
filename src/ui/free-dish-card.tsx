"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FreeDishRow, SlotTarget } from "@/server/free-dish";

const T = {
  en: { left: "left", placed: "placed", eaten: "eaten", today: "I ate one today", spread: (n: number) => `Spread the ${n} left over the next meals`, del: "Delete", noRoom: "No open lunch or dinner left this week.", stock: "stock taken" },
  fr: { left: "restantes", placed: "posées", eaten: "mangées", today: "J'en ai mangé une aujourd'hui", spread: (n: number) => `Étaler les ${n} restantes sur les prochains repas`, del: "Supprimer", noRoom: "Plus aucun déjeuner ou dîner ouvert cette semaine.", stock: "stock décompté" },
} as const;

export function FreeDishCard({ dish, targets, lang }: { dish: FreeDishRow; targets: SlotTarget[]; lang: "en" | "fr" }) {
  const t = T[lang];
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const left = Math.max(0, dish.portions - dish.placed);
  const today = new Date().toISOString().slice(0, 10);

  async function call(body: Record<string, unknown>, method = "POST", url = "/api/free/place") {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { error?: string; placed?: number };
    if (!res.ok) setNote(data.error ?? "error");
    router.refresh();
    setBusy(false);
  }

  return (
    <article className="etal-card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[17px] font-bold">{dish.title}</h3>
        <span className="tabnum text-[13px]" style={{ color: "var(--soft)" }}>
          ≈ <b style={{ color: "var(--ink)" }}>{Math.round(dish.kcal)} kcal</b> · {Math.round(dish.protein)} g P · {Math.round(dish.portionG)} g / portion
        </span>
      </div>
      <p className="text-[12.5px]" style={{ color: "var(--soft)" }}>
        {dish.ingredients.map((i) => `${i.label} ${i.grams} g`).join(" · ")}
        {dish.stockTaken ? ` · ${t.stock}` : ""}
      </p>
      <div className="flex flex-wrap gap-1.5 text-[12px] font-bold">
        <Chip color="var(--argile)">{dish.portions} portions</Chip>
        <Chip color="var(--myrtille)">{dish.placed} {t.placed}</Chip>
        <Chip color="var(--feuille)">{dish.eaten} {t.eaten}</Chip>
        <Chip color="var(--curcuma)">{left} {t.left}</Chip>
      </div>

      {left > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={busy}
            onClick={() => void call({ date: today, kind: "portion", dishId: dish.id }, "POST", "/api/entry")}
            className="etal-btn etal-btn--color text-[13px] disabled:opacity-40"
            style={{ "--c": "var(--argile)" } as React.CSSProperties}
          >
            {t.today}
          </button>
          {targets.filter((x) => !x.free).length > 0 ? (
            <button
              disabled={busy}
              onClick={() => void call({ dishId: dish.id, count: left })}
              className="etal-btn text-[13px] disabled:opacity-40"
            >
              {t.spread(left)}
            </button>
          ) : (
            <span className="text-[12.5px]" style={{ color: "var(--soft)" }}>
              {t.noRoom}
            </span>
          )}
        </div>
      ) : null}

      {note ? (
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--tomate)" }}>
          {note}
        </span>
      ) : null}
      {dish.placed === dish.eaten ? (
        <button
          disabled={busy}
          onClick={() => void call({ dishId: dish.id }, "DELETE", "/api/free")}
          className="self-end text-[12px] font-semibold underline-offset-2 hover:underline"
          style={{ color: "var(--soft)" }}
        >
          {t.del}
        </button>
      ) : null}
    </article>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="rounded-full px-2.5 py-1" style={{ background: color, color: "var(--on-color)" }}>
      {children}
    </span>
  );
}
