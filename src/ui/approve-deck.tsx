"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SLOT_SOLID, SLOT_LABEL } from "./shell";
import { cuisineLabel } from "@/core/cuisines";

export interface Dish {
  recipeId: string;
  title: string;
  cuisine: string;
  image: string | null;
  kcal: number;
  protein: number;
  minutes: number | null;
  /** Combien de fois ce plat revient dans la semaine, et sur quels créneaux. */
  times: number;
  slots: { slotId: string; date: string; slot: string }[];
  state: string;
}

const T = {
  en: {
    outQ: "Are you planning to eat out this week?",
    outSub: "Restaurant, a friend's place, family, anything you will not cook yourself.",
    outNote: "A rough guess is fine, and you can change it later. Those meals just leave the shopping list.",
    outNone: "No, I cook everything",
    start: "Start choosing",
    yes: "Yes, cook this",
    out: "Eating out",
    other: "Something else",
    dishes: "dishes",
    left: "left",
    approved: "approved",
    done: "Every dish decided.",
    make: "Make the shopping list",
    times: "times this week",
    once: "once this week",
    change: "change the number",
    outLeft: "meals out still to place",
    tip: "Nothing goes on the shopping list until you have said yes to it.",
    howMany: "How many times this week?",
    noRoom: "No free slot of that kind left this week.",
  },
  fr: {
    outQ: "Tu prévois de manger dehors cette semaine ?",
    outSub: "Restaurant, chez un pote, en famille, tout ce que tu ne cuisineras pas toi-même.",
    outNote: "Une estimation suffit, tu pourras changer. Ces repas sortent simplement de la liste de courses.",
    outNone: "Non, je cuisine tout",
    start: "Commencer à choisir",
    yes: "Oui, je le fais",
    out: "Je mange dehors",
    other: "Autre chose",
    dishes: "plats",
    left: "restants",
    approved: "validés",
    done: "Tous les plats sont tranchés.",
    make: "Faire la liste de courses",
    times: "fois cette semaine",
    once: "une fois cette semaine",
    change: "changer le nombre",
    outLeft: "repas dehors à placer",
    tip: "Rien ne part en liste de courses tant que tu n'as pas dit oui.",
    howMany: "Combien de fois cette semaine ?",
    noRoom: "Plus aucun créneau libre de ce type cette semaine.",
  },
} as const;

export function ApproveDeck({
  dishes,
  ingredients,
  weekStart,
  mealsOut,
  lang,
}: {
  dishes: Dish[];
  ingredients: Record<string, string[]>;
  weekStart: string;
  mealsOut: number;
  lang: "en" | "fr";
}) {
  const router = useRouter();
  const t = T[lang];
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(mealsOut > 0);
  const [notice, setNotice] = useState<string | null>(null);

  const pending = useMemo(() => dishes.filter((d) => d.state === "planned"), [dishes]);
  const approved = dishes.filter((d) => d.state === "approved").length;
  const outPlaced = dishes.reduce(
    (n, d) => n + (d.state === "eating_out" ? d.times : 0),
    0,
  );
  const outLeft = Math.max(0, mealsOut - outPlaced);
  const dish = pending[0];

  async function setOut(n: number) {
    setBusy(true);
    await fetch("/api/approve", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealsOut: n }),
    });
    setAsked(true);
    router.refresh();
    setBusy(false);
  }

  async function decide(action: "yes" | "out" | "undo", recipeId?: string, slotId?: string) {
    setBusy(true);
    await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId, slotId, action, weekStart }),
    });
    router.refresh();
    setBusy(false);
  }

  async function repeat(d: Dish, times: number) {
    if (times === d.times) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/repeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId: d.recipeId, weekStart, times }),
    });
    if (!res.ok) setNotice(t.noRoom);
    router.refresh();
    setBusy(false);
  }

  async function other(d: Dish) {
    setBusy(true);
    await fetch("/api/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: d.slots[0]?.slotId, wholeRecipe: true }),
    });
    router.refresh();
    setBusy(false);
  }

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { weekday: "short" });

  // Étape 1 : le nombre de repas dehors, avant de choisir quoi que ce soit.
  if (!asked) {
    return (
      <div className="etal-card p-5">
        <h2 className="text-[22px] leading-tight">{t.outQ}</h2>
        <p className="mt-1 text-[14px]" style={{ color: "var(--soft)" }}>
          {t.outSub}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void setOut(0)}
            disabled={busy}
            className="etal-btn text-[14px]"
          >
            {t.outNone}
          </button>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => void setOut(n)}
              disabled={busy}
              className="display flex h-14 w-14 items-center justify-center rounded-full text-[22px] transition-transform hover:scale-105"
              style={{ background: "var(--myrtille)", color: "#fff" }}
              aria-label={`${n}`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-4 max-w-[62ch] text-[13px] leading-snug" style={{ color: "var(--soft)" }}>
          {t.outNote}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Count value={pending.length} label={`${t.dishes} ${t.left}`} color="var(--curcuma)" />
        <Count value={approved} label={t.approved} color="var(--feuille)" />
        {outLeft > 0 ? <Count value={outLeft} label={t.outLeft} color="var(--myrtille)" /> : null}
        <button
          onClick={() => setAsked(false)}
          className="text-[12px] font-semibold underline underline-offset-2"
          style={{ color: "var(--soft)" }}
        >
          {t.change}
        </button>
        <span
          className="ml-auto h-2 min-w-[120px] flex-1 overflow-hidden rounded-full"
          style={{ background: "var(--surface2)" }}
        >
          <span
            className="block h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${dishes.length === 0 ? 0 : ((dishes.length - pending.length) / dishes.length) * 100}%`,
              background: "var(--feuille)",
            }}
          />
        </span>
      </div>

      {dish ? (
        <>
          <article
            className="relative overflow-hidden rounded-[9px]"
            style={{ background: SLOT_SOLID[dish.slots[0]?.slot ?? "dinner"] ?? "#d63127", color: "#fff" }}
          >
            {dish.image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dish.image} alt="" className="h-[300px] w-full object-cover sm:h-[380px]" />
                <span
                  className="pointer-events-none absolute inset-0"
                  style={{ background: "linear-gradient(0deg, rgb(0 0 0 / 0.88) 0%, rgb(0 0 0 / 0.15) 58%, transparent 100%)" }}
                />
              </>
            ) : (
              <div className="h-[200px]" />
            )}
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <div className="text-[12px] font-bold uppercase tracking-wider opacity-85">
                {[...new Set(dish.slots.map((s) => SLOT_LABEL[s.slot] ?? s.slot))].join(" / ")} ·{" "}
                {dish.times > 1 ? `${dish.times} ${t.times}` : t.once} · {cuisineLabel(dish.cuisine)}
              </div>
              <h2 className="display mt-1 text-[clamp(26px,5vw,42px)] leading-[0.98]">{dish.title}</h2>
              <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-snug opacity-90">
                {(ingredients[dish.recipeId] ?? []).join(" · ")}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip>{Math.round(dish.kcal)} kcal</Chip>
                <Chip>{Math.round(dish.protein)} g protein</Chip>
                {dish.minutes ? <Chip>{dish.minutes} min</Chip> : null}
                {dish.slots.map((s) => (
                  <Chip key={s.slotId}>
                    {day(s.date)} · {SLOT_LABEL[s.slot] ?? s.slot}
                  </Chip>
                ))}
              </div>
            </div>
          </article>

          <div className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "var(--soft)" }}>
            <span className="font-semibold">{t.howMany}</span>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => void repeat(dish, n)}
                disabled={busy}
                aria-pressed={dish.times === n}
                className="tabnum rounded-full px-3 py-1 text-[13px] font-bold transition-colors"
                style={{
                  background: dish.times === n ? "var(--curcuma)" : "var(--surface2)",
                  color: dish.times === n ? "var(--on-color)" : "var(--ink)",
                }}
              >
                ×{n}
              </button>
            ))}
            {notice ? <span style={{ color: "var(--tomate)" }}>{notice}</span> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void decide("yes", dish.recipeId)}
              disabled={busy}
              className="etal-btn etal-btn--color flex-1 text-[15px]"
              style={{ "--c": "#137a42" } as React.CSSProperties}
            >
              {t.yes}
            </button>
            <button onClick={() => void other(dish)} disabled={busy} className="etal-btn text-[15px]">
              {t.other}
            </button>
            {outLeft > 0 ? (
              <button
                onClick={() => void decide("out", undefined, dish.slots[0]?.slotId)}
                disabled={busy}
                className="etal-btn etal-btn--color text-[15px]"
                style={{ "--c": "#2440c8" } as React.CSSProperties}
              >
                {t.out}
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="etal-card p-5">
          <h2 className="text-[20px]">{t.done}</h2>
          <a
            href="/groceries"
            className="etal-btn etal-btn--color mt-3 inline-block text-[15px] no-underline"
            style={{ "--c": "#137a42" } as React.CSSProperties}
          >
            {t.make}
          </a>
        </div>
      )}

      <p className="text-[12.5px]" style={{ color: "var(--soft)" }}>
        {t.tip}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {dishes
          .filter((d) => d.state !== "planned")
          .map((d) => (
            <button
              key={d.recipeId}
              onClick={() => void decide("undo", d.recipeId)}
              disabled={busy}
              className="rounded-full px-2.5 py-1 text-[12px] font-bold transition-opacity hover:opacity-70"
              style={{
                background: d.state === "eating_out" ? "var(--myrtille)" : "var(--feuille)",
                color: "var(--on-color)",
              }}
            >
              {d.state === "eating_out" ? "🍽 " : "✓ "}
              {d.title}
            </button>
          ))}
      </div>
    </div>
  );
}

function Count({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="display tabnum text-[24px] leading-none" style={{ color }}>
        {value}
      </span>
      <span className="text-[12px] font-semibold" style={{ color: "var(--soft)" }}>
        {label}
      </span>
    </span>
  );
}

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full bg-white/22 px-2.5 py-1 text-[12px] font-bold">{children}</span>
);
