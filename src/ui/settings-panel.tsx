"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LangToggle } from "./lang-toggle";
import { DEFAULT_SPLIT, SPLIT_SLOTS, type KcalSplit } from "@/core/schedule";
import type { SlotKind } from "@/core/types";

export interface Settings {
  breakfastDaysPerWeek: number;
  snackDaysPerWeek: number;
  weekStartsOn: number;
  shoppingWeekday: number;
  meatPerMainMealG: number;
  weeklyBudgetEur: number | null;
  spiceTolerance: number;
  maxPans: number;
  kcalTarget: number;
  proteinTargetG: number;
  /** Part de chaque repas dans la journée. null = parts par défaut. */
  kcalSplit: KcalSplit | null;
}

const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export function SettingsPanel({ initial, lang }: { initial: Settings; lang: "en" | "fr" }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const fr = lang === "fr";
  const days = fr ? DAYS_FR : DAYS_EN;

  async function save(patch: Partial<Settings>, key: string) {
    setV((prev) => ({ ...prev, ...patch }));
    setSaving(key);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    router.refresh();
    setSaving(null);
  }

  // Combien de vrais repas un jour compte, une fois petit-déj et collation décidés.
  const mealsPerDay = 2 + (v.breakfastDaysPerWeek !== 0 ? 1 : 0) + (v.snackDaysPerWeek !== 0 ? 1 : 0);

  return (
    <div className="flex flex-col gap-5">
      <Group
        title={fr ? "Le rythme de tes journées" : "How your days are built"}
        note={
          fr
            ? `${mealsPerDay} repas par jour. Ce que tu retires part sur le déjeuner et le dîner.`
            : `${mealsPerDay} meals a day. What you drop moves onto lunch and dinner.`
        }
      >
        <Row label={fr ? "Petits-déjeuners" : "Breakfasts"} saving={saving === "breakfast"}>
          <Counter
            value={v.breakfastDaysPerWeek}
            onPick={(n) => void save({ breakfastDaysPerWeek: n }, "breakfast")}
            lang={lang}
          />
        </Row>
        <Row
          label={fr ? "Collations" : "Snacks"}
          hint={fr ? "pas snack ? zéro" : "not a snacker? zero"}
          saving={saving === "snack"}
        >
          <Counter
            value={v.snackDaysPerWeek}
            onPick={(n) => void save({ snackDaysPerWeek: n }, "snack")}
            lang={lang}
          />
        </Row>
      </Group>

      <Group
        title={fr ? "Langue des aliments" : "Language of food names"}
        note={fr ? "Noms des aliments et des plats." : "Names of foods and dishes."}
      >
        <div className="flex items-center gap-2">
          <LangToggle />
        </div>
      </Group>

      <Group title={fr ? "Ta semaine" : "Your week"}>
        <Row label={fr ? "Elle commence le" : "Starts on"} saving={saving === "start"}>
          <Pills
            options={days.map((d, i) => ({ value: i, label: d }))}
            value={v.weekStartsOn}
            onPick={(n) => void save({ weekStartsOn: n }, "start")}
          />
        </Row>
        <Row label={fr ? "Jour des courses" : "Shopping day"} saving={saving === "shop"}>
          <Pills
            options={days.map((d, i) => ({ value: i, label: d }))}
            value={v.shoppingWeekday}
            onPick={(n) => void save({ shoppingWeekday: n }, "shop")}
          />
        </Row>
      </Group>

      <Group title={fr ? "Ce que tu manges" : "What lands on the plate"}>
        <Row
          label={fr ? "Viande, poisson ou œufs par repas principal" : "Meat, fish or eggs per main meal"}
          saving={saving === "meat"}
        >
          <Pills
            options={[0, 150, 200, 250, 300, 350].map((n) => ({
              value: n,
              label: n === 0 ? (fr ? "pas d'exigence" : "no rule") : `${n} g`,
            }))}
            value={v.meatPerMainMealG}
            onPick={(n) => void save({ meatPerMainMealG: n }, "meat")}
          />
        </Row>
        <Row label={fr ? "Piment" : "Spice"} saving={saving === "spice"}>
          <Pills
            options={[
              { value: 0, label: fr ? "aucun" : "none" },
              { value: 1, label: fr ? "doux" : "mild" },
              { value: 2, label: fr ? "moyen" : "medium" },
              { value: 3, label: fr ? "fort" : "hot" },
              { value: 4, label: fr ? "brûlant" : "burning" },
            ]}
            value={v.spiceTolerance}
            onPick={(n) => void save({ spiceTolerance: n }, "spice")}
          />
        </Row>
        <Row label={fr ? "Casseroles maximum" : "Most pans at once"} saving={saving === "pans"}>
          <Pills
            options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
            value={v.maxPans}
            onPick={(n) => void save({ maxPans: n }, "pans")}
          />
        </Row>
      </Group>

      <Group
        title={fr ? "Les cibles" : "The targets"}
        note={fr ? "Proposées par Numbers, forçables ici." : "Proposed by Numbers, overridable here."}
      >
        <Row label={fr ? "Calories par jour" : "Calories a day"} saving={saving === "kcal"}>
          <NumberField
            value={v.kcalTarget}
            min={1200}
            max={7000}
            step={10}
            unit="kcal"
            onCommit={(n) => void save({ kcalTarget: n }, "kcal")}
          />
        </Row>
        <Row label={fr ? "Protéines par jour" : "Protein a day"} saving={saving === "protein"}>
          <NumberField
            value={v.proteinTargetG}
            min={40}
            max={400}
            step={5}
            unit="g"
            onCommit={(n) => void save({ proteinTargetG: n }, "protein")}
          />
        </Row>
        <Row label={fr ? "Budget hebdomadaire" : "Weekly budget"} saving={saving === "budget"}>
          <NumberField
            value={v.weeklyBudgetEur ?? 0}
            min={0}
            max={500}
            step={5}
            unit="€"
            onCommit={(n) => void save({ weeklyBudgetEur: n === 0 ? null : n }, "budget")}
          />
        </Row>
      </Group>

      <Group
        title={fr ? "Comment tes calories se répartissent" : "How your calories split across the day"}
        note={
          fr
            ? "Bouge un repas, les autres suivent pour rester à 100 %. Les assiettes de la semaine sont redosées aussitôt."
            : "Drag one meal, the others follow to stay at 100 %. This week's plates are re-dosed right away."
        }
      >
        <SplitEditor
          split={v.kcalSplit ?? DEFAULT_SPLIT}
          custom={v.kcalSplit !== null}
          kcalTarget={v.kcalTarget}
          hidden={new Set<SlotKind>([
            ...(v.breakfastDaysPerWeek === 0 ? (["breakfast"] as SlotKind[]) : []),
            ...(v.snackDaysPerWeek === 0 ? (["snack"] as SlotKind[]) : []),
          ])}
          saving={saving === "split"}
          lang={lang}
          onCommit={(split) => void save({ kcalSplit: split }, "split")}
        />
      </Group>
    </div>
  );
}

const SLOT_NAME: Record<"en" | "fr", Record<SlotKind, string>> = {
  en: { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" },
  fr: { breakfast: "Petit-déjeuner", lunch: "Déjeuner", snack: "Collation", dinner: "Dîner" },
};

const SLOT_COLOR: Record<SlotKind, string> = {
  breakfast: "#c07a06",
  lunch: "#2440c8",
  snack: "#ab1565",
  dinner: "#b0562f",
};

/**
 * Quatre curseurs liés : la part déplacée est reprise aux autres repas au
 * prorata, pour que la journée fasse toujours 100 %. Les repas retirés du
 * rythme (petit-déjeuner à zéro, collation à zéro) ne sont pas montrés : leur
 * part revient de toute façon au déjeuner et au dîner.
 */
function SplitEditor({
  split,
  custom,
  kcalTarget,
  hidden,
  saving,
  lang,
  onCommit,
}: {
  split: KcalSplit;
  custom: boolean;
  kcalTarget: number;
  hidden: Set<SlotKind>;
  saving: boolean;
  lang: "en" | "fr";
  onCommit: (split: KcalSplit | null) => void;
}) {
  const fr = lang === "fr";
  const [draft, setDraft] = useState<KcalSplit>(split);
  const timer = useRef<number | null>(null);
  useEffect(() => setDraft(split), [split]);

  const visible = SPLIT_SLOTS.filter((s) => !hidden.has(s));
  const visibleTotal = visible.reduce((sum, s) => sum + draft[s], 0) || 1;
  const shown = (s: SlotKind) => draft[s] / visibleTotal;

  function move(slot: SlotKind, pct: number) {
    const target = Math.min(0.7, Math.max(0.05, pct / 100));
    const others = visible.filter((s) => s !== slot);
    const othersNow = others.reduce((sum, s) => sum + shown(s), 0);
    const next: KcalSplit = { ...draft };
    next[slot] = target * visibleTotal;
    for (const s of others) {
      const weight = othersNow > 0 ? shown(s) / othersNow : 1 / others.length;
      next[s] = (1 - target) * weight * visibleTotal;
    }
    setDraft(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onCommit(next), 500);
  }

  function preset(kind: "default" | "even") {
    if (timer.current) window.clearTimeout(timer.current);
    if (kind === "default") {
      setDraft(DEFAULT_SPLIT);
      onCommit(null);
      return;
    }
    const next: KcalSplit = { ...draft };
    for (const s of visible) next[s] = visibleTotal / visible.length;
    setDraft(next);
    onCommit(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((s) => {
        const pct = Math.round(shown(s) * 100);
        return (
          <label key={s} className="flex items-center gap-3">
            <span className="flex w-[110px] shrink-0 items-center gap-2 text-[13px] font-semibold">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SLOT_COLOR[s] }} />
              {SLOT_NAME[lang][s]}
            </span>
            <input
              type="range"
              min={5}
              max={70}
              step={1}
              value={pct}
              onChange={(e) => move(s, Number(e.target.value))}
              className="etal-slider flex-1"
              style={{ "--c": SLOT_COLOR[s] } as React.CSSProperties}
              aria-label={`${SLOT_NAME[lang][s]} ${pct} %`}
            />
            <span className="tabnum flex w-[72px] shrink-0 flex-col items-end leading-tight">
              <b className="text-[15px]">{pct} %</b>
              <span className="whitespace-nowrap text-[11px]" style={{ color: "var(--soft)" }}>
                {Math.round((kcalTarget * shown(s)) / 10) * 10} kcal
              </span>
            </span>
          </label>
        );
      })}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <Pills
          options={[
            { value: 0, label: fr ? "Par défaut" : "Default" },
            { value: 1, label: fr ? "À parts égales" : "Even" },
          ]}
          value={custom ? -1 : 0}
          onPick={(n) => preset(n === 0 ? "default" : "even")}
        />
        {saving ? (
          <span className="text-[13px]" style={{ color: "var(--feuille)" }}>
            ✓
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="etal-card p-4">
      <h2 className="text-[16px] font-bold">{title}</h2>
      {note ? (
        <p className="mt-1 max-w-[70ch] text-[13px] leading-snug" style={{ color: "var(--soft)" }}>
          {note}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  saving,
  children,
}: {
  label: string;
  hint?: string;
  saving: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold">
        {label}
        {hint ? (
          <span className="pl-2 font-normal" style={{ color: "var(--soft)" }}>
            {hint}
          </span>
        ) : null}
        {saving ? (
          <span className="pl-2" style={{ color: "var(--feuille)" }}>
            ✓
          </span>
        ) : null}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Pills({
  options,
  value,
  onPick,
}: {
  options: { value: number; label: string }[];
  value: number;
  onPick: (v: number) => void;
}) {
  return (
    <>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onPick(o.value)}
          aria-pressed={o.value === value}
          className="rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors"
          style={{
            background: o.value === value ? "var(--myrtille)" : "var(--surface2)",
            color: o.value === value ? "#fff" : "var(--ink)",
          }}
        >
          {o.label}
        </button>
      ))}
    </>
  );
}

/** 0 à 7 jours, présenté en langage clair plutôt qu'en chiffres nus. */
function Counter({
  value,
  onPick,
  lang,
}: {
  value: number;
  onPick: (v: number) => void;
  lang: "en" | "fr";
}) {
  const label = (n: number) =>
    n === -1
      ? lang === "fr"
        ? "au hasard"
        : "random"
      : n === 0
        ? lang === "fr"
          ? "jamais"
          : "never"
        : n === 7
          ? lang === "fr"
            ? "tous les jours"
            : "every day"
          : `${n} ${lang === "fr" ? (n > 1 ? "jours" : "jour") : n > 1 ? "days" : "day"}`;
  return (
    <Pills
      options={[0, 1, 2, 3, 4, 5, 7, -1].map((n) => ({ value: n, label: label(n) }))}
      value={value}
      onPick={onPick}
    />
  );
}

function NumberField({
  value,
  min,
  max,
  step,
  unit,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <span className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Math.max(min, Math.min(max, Number(draft)));
          if (Number.isFinite(n) && n !== value) onCommit(n);
          setDraft(String(n));
        }}
        className="tabnum w-[90px] rounded-[6px] px-2.5 py-2 text-[15px] font-bold"
        style={{ background: "var(--surface2)", color: "var(--ink)" }}
      />
      <span className="text-[13px]" style={{ color: "var(--soft)" }}>
        {unit}
      </span>
    </span>
  );
}
