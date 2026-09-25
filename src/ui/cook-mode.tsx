"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CookScreen } from "@/server/cook-service";
import { SLOT_COLOR, SLOT_SOLID, SLOT_LABEL } from "./shell";
import { FoodMenu } from "./food-menu";
import { cuisineLabel } from "@/core/cuisines";

const ROLE_LABEL: Record<string, string> = {
  protein_core: "protein",
  carb_base: "base",
  fat_carrier: "fat",
  vegetable_bulk: "veg",
  aromatic: "aromatic",
  acid: "acid",
  finisher: "finish",
  binder: "binder",
  liquid: "liquid",
  sweetener: "sweet",
};

/** Une couleur par rôle : on repère la protéine, la base et le gras sans lire. */
const ROLE_COLOR: Record<string, string> = {
  protein_core: "#c0453f",
  carb_base: "#c07a06",
  fat_carrier: "#7a3fd4",
  vegetable_bulk: "#0f9d58",
  aromatic: "#4d2880",
  acid: "#0a8ea0",
  finisher: "#565a4e",
  binder: "#565a4e",
  liquid: "#0a8ea0",
  sweetener: "#d1810a",
};

export function CookMode({ screen, lang }: { screen: CookScreen; lang: "en" | "fr" }) {
  const foodName = (m?: { nameEn: string; nameFr: string }, fallback = "") =>
    (lang === "fr" ? m?.nameFr : m?.nameEn) ?? fallback;
  const router = useRouter();
  const color = SLOT_COLOR[screen.slot.slot] ?? "var(--tomate)";
  const solid = SLOT_SOLID[screen.slot.slot] ?? "#d63127";
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [stepDone, setStepDone] = useState<Record<number, boolean>>({});
  const [wakeLockOn, setWakeLockOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (nav.wakeLock) {
      nav.wakeLock
        .request("screen")
        .then((l) => {
          lock = l;
          setWakeLockOn(true);
        })
        .catch(() => setWakeLockOn(false));
    }
    return () => {
      void lock?.release();
    };
  }, []);

  const ingredients = useMemo(
    () =>
      screen.recipe.ingredients
        .map((i) => {
          const grams = screen.plan.grams[i.conceptId] ?? 0;
          return {
            ...i,
            grams,
            cooked: screen.plan.cookedGrams[i.conceptId] ?? 0,
            meta: screen.labels[i.conceptId],
            kcal: Math.round((i.nutrition.kcal * grams) / 100),
            protein: Math.round((i.nutrition.protein * grams) / 100),
          };
        })
        .filter((i) => i.grams > 0)
        .sort((a, b) => b.grams - a.grams),
    [screen],
  );

  const allChecked = ingredients.every((i) => checked[i.conceptId]);

  async function markCooked() {
    setBusy(true);
    await fetch("/api/cook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: screen.slot.id, grams: screen.plan.grams }),
    });
    router.push("/");
    router.refresh();
  }

  async function swap() {
    setBusy(true);
    const res = await fetch("/api/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: screen.slot.id }),
    });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  return (
    <div className="min-h-dvh pb-28" style={{ background: "var(--ground)" }}>
      <header className="relative px-4 pt-5 lg:px-8" style={{ background: solid, color: "#fff" }}>
        {screen.image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={screen.image} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ opacity: 0.5 }} />
            <span
              className="absolute inset-0"
              style={{ background: `linear-gradient(180deg, ${solid}e6 0%, ${solid}b3 45%, ${solid}f2 100%)` }}
            />
          </>
        ) : null}
        <div className="relative mx-auto max-w-[900px] pb-5">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-[13px] font-bold no-underline opacity-85 hover:opacity-100" style={{ color: "inherit" }}>
              ← Back
            </Link>
            <span className="text-[12px] font-bold uppercase tracking-wide opacity-80">
              {SLOT_LABEL[screen.slot.slot]} · {cuisineLabel(screen.cuisine)}
              {wakeLockOn ? " · screen stays on" : ""}
            </span>
          </div>
          <h1 className="display mt-3 text-[clamp(32px,7vw,60px)] leading-[0.93]">{screen.recipe.title}</h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip>{screen.plan.display.kcal} kcal</Chip>
            <Chip>{screen.plan.display.protein} g protein</Chip>
            <Chip>{screen.plan.display.carb} g carbs</Chip>
            <Chip>{screen.plan.display.fat} g fat</Chip>
            <Chip>{screen.recipe.activeMinutes} min active</Chip>
            {screen.passiveMinutes ? <Chip>{screen.passiveMinutes} min passive</Chip> : null}
          </div>
          {screen.plan.status !== "optimal" ? (
            <div className="mt-3 rounded-[7px] bg-black/25 p-3 text-[13px] font-semibold">
              {screen.plan.message}
              {screen.plan.hint ? (
                <div className="mt-1 opacity-85">
                  Widen {foodName(screen.labels[screen.plan.hint.conceptId], screen.plan.hint.conceptId)}: {screen.plan.hint.reason}.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-[900px] px-4 lg:px-8">
        {screen.image ? (
          <figure className="relative mt-5 overflow-hidden rounded-[9px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={screen.image} alt={screen.recipe.title} className="h-[260px] w-full object-cover sm:h-[320px]" />
            <figcaption
              className="absolute bottom-0 left-0 right-0 px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider"
              style={{ background: "linear-gradient(0deg, rgb(0 0 0 / 0.72), transparent)", color: "#fff" }}
            >
              what it should look like
            </figcaption>
          </figure>
        ) : null}

        <section className="mt-5">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[19px]">Weigh this</h2>
            <button
              onClick={() => setShowProvenance((v) => !v)}
              className="text-[12px] font-bold underline-offset-4 hover:underline"
              style={{ color: "var(--soft)" }}
            >
              {showProvenance ? "hide sources" : "where do these numbers come from?"}
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {ingredients.map((i) => {
              const on = !!checked[i.conceptId];
              return (
                <FoodMenu key={i.conceptId} conceptId={i.conceptId} name={foodName(i.meta, i.conceptId)}>
                <button
                  onClick={() => setChecked((c) => ({ ...c, [i.conceptId]: !c[i.conceptId] }))}
                  className="etal-card relative flex w-full items-center gap-3 overflow-hidden p-3 pl-4 text-left transition-transform duration-150 hover:translate-x-0.5"
                  style={{ opacity: on ? 0.42 : 1 }}
                >
                  <span
                    className="absolute bottom-0 left-0 top-0 w-[5px]"
                    style={{ background: ROLE_COLOR[i.role] ?? "var(--soft)" }}
                    aria-hidden
                  />
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-bold transition-colors"
                    style={{
                      background: on ? ROLE_COLOR[i.role] ?? solid : "transparent",
                      color: on ? "#fff" : ROLE_COLOR[i.role] ?? "var(--soft)",
                      boxShadow: on ? "none" : `inset 0 0 0 2px ${ROLE_COLOR[i.role] ?? "var(--soft)"}`,
                    }}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold" style={{ textDecoration: on ? "line-through" : "none" }}>
                      {foodName(i.meta, i.conceptId)}
                      <span
                        className="ml-2 inline-block rounded-full px-2 py-0.5 align-middle text-[10.5px] font-bold uppercase tracking-[0.08em]"
                        style={{ background: ROLE_COLOR[i.role] ?? "var(--soft)", color: "#fff" }}
                      >
                        {ROLE_LABEL[i.role] ?? i.role}
                      </span>
                      <span className="pl-1.5 text-[12px] font-semibold" style={{ color: "var(--soft)" }}>
                        {i.meta?.state === "dry" ? "dry" : i.meta?.state === "cooked" ? "cooked" : "raw"}
                      </span>
                    </div>
                    {showProvenance ? (
                      <div className="mt-0.5 text-[11px]" style={{ color: "var(--soft)" }}>
                        {i.meta?.label} · {i.meta?.source}
                        {i.meta?.sourceRef ? ` · ${i.meta.sourceRef}` : ""}
                      </div>
                    ) : null}
                  </div>
                  <div className="relative w-[140px] shrink-0 text-right">
                    <span
                      className="pointer-events-none absolute -right-1 top-1/2 h-[46px] w-[46px] -translate-y-1/2 rounded-full"
                      style={{ background: ROLE_COLOR[i.role] ?? "var(--soft)", opacity: on ? 0.06 : 0.14 }}
                      aria-hidden
                    />
                    <div
                      className="tabnum display relative text-[30px] leading-none"
                      style={{ color: on ? "var(--soft)" : "var(--ink)" }}
                    >
                      {Math.round(i.grams)}
                      <span className="pl-0.5 text-[17px]" style={{ color: ROLE_COLOR[i.role] ?? "var(--soft)" }}>
                        g
                      </span>
                    </div>
                    <div className="tabnum mt-1 text-[12px] font-semibold" style={{ color: "var(--soft)" }}>
                      {i.kcal} kcal
                      {i.protein >= 3 ? ` · ${i.protein} g P` : ""}
                    </div>
                    {i.cooked !== Math.round(i.grams) ? (
                      <div className="tabnum text-[12px] font-semibold" style={{ color: "var(--soft)" }}>
                        {Math.round(i.cooked)} g cooked
                      </div>
                    ) : null}
                  </div>
                </button>
                </FoodMenu>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[19px]">Method</h2>
          <div className="flex flex-col gap-1.5">
            {screen.steps.map((s) => {
              const on = !!stepDone[s.position];
              return (
                <button
                  key={s.position}
                  onClick={() => setStepDone((d) => ({ ...d, [s.position]: !d[s.position] }))}
                  className="etal-card flex w-full gap-3 p-3 text-left"
                  style={{ opacity: on ? 0.45 : 1 }}
                >
                  <span
                    className="tabnum flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] font-bold"
                    style={{ background: on ? color : "var(--surface2)", color: on ? "var(--on-color)" : "var(--soft)" }}
                  >
                    {s.position + 1}
                  </span>
                  <span className="text-[15px] leading-snug" style={{ textDecoration: on ? "line-through" : "none" }}>
                    {s.text}
                  </span>
                </button>
              );
            })}
          </div>
          {screen.notes ? (
            <p className="mt-3 rounded-[7px] p-3 text-[14px]" style={{ background: "var(--surface)", color: "var(--soft)" }}>
              {screen.notes}
            </p>
          ) : null}
        </section>

        <div
          className="sticky bottom-0 z-20 mt-6 flex gap-2 py-3"
          style={{ background: "linear-gradient(to top, var(--ground) 62%, transparent)", paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={markCooked}
            disabled={busy}
            className="etal-btn etal-btn--color flex-1 text-[16px]"
            style={{ "--c": solid } as React.CSSProperties}
          >
            {allChecked ? "Done, log it" : "I cooked this"}
          </button>
          <button onClick={swap} disabled={busy} className="etal-btn etal-btn--quiet">
            Not this
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/22 px-2.5 py-1 text-[12px] font-bold">{children}</span>;
}
