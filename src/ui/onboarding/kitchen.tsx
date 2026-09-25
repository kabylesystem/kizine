"use client";

import { useState } from "react";

const EQUIPMENT = [
  { id: "stovetop", label: "Stovetop", on: true },
  { id: "oven", label: "Oven", on: true },
  { id: "microwave", label: "Microwave", on: true },
  { id: "rice-cooker", label: "Rice cooker", on: true },
  { id: "blender", label: "Blender", on: true },
  { id: "freezer", label: "Freezer", on: true },
  { id: "scale", label: "Kitchen scale", on: true },
  { id: "air-fryer", label: "Air fryer", on: false },
  { id: "pressure-cooker", label: "Pressure cooker", on: false },
  { id: "food-processor", label: "Food processor", on: false },
  { id: "grill", label: "Grill", on: false },
  { id: "slow-cooker", label: "Slow cooker", on: false },
];

export interface KitchenValues {
  equipment: string[];
  spiceTolerance: number;
  maxPans: number;
  shoppingWeekday: number;
  weeklyBudgetEur: number | null;
  leftoverTolerance: number;
}

interface Props {
  shoppingWeekday: number;
  initial?: KitchenValues;
  onDone: (kitchen: {
    equipment: string[];
    spiceTolerance: number;
    maxPans: number;
    shoppingWeekday: number;
    weeklyBudgetEur: number | null;
    leftoverTolerance: number;
  }) => void;
}

export function Kitchen({ shoppingWeekday, onDone, initial }: Props) {
  const [equipment, setEquipment] = useState<string[]>(
    initial?.equipment.length ? initial.equipment : EQUIPMENT.filter((e) => e.on).map((e) => e.id),
  );
  const [spice, setSpice] = useState(initial?.spiceTolerance ?? 3);
  const [pans, setPans] = useState(initial?.maxPans ?? 3);
  const [budget, setBudget] = useState(initial?.weeklyBudgetEur ?? 90);
  const [leftovers, setLeftovers] = useState(initial?.leftoverTolerance ?? 1);

  const toggle = (id: string) =>
    setEquipment((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  return (
    <div className="flex w-full max-w-[620px] flex-col gap-3">
      <div className="etal-card p-3">
        <div className="mb-2 text-[14px] font-bold">What you actually own</div>
        <div className="flex flex-wrap gap-1.5">
          {EQUIPMENT.map((e) => {
            const on = equipment.includes(e.id);
            return (
              <button
                key={e.id}
                onClick={() => toggle(e.id)}
                className="rounded-full px-3 py-1.5 text-[13px] font-bold transition-all duration-150 hover:-translate-y-0.5"
                style={{
                  background: on ? "var(--feuille)" : "var(--surface2)",
                  color: on ? "var(--on-color)" : "var(--soft)",
                }}
              >
                {e.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px]" style={{ color: "var(--soft)" }}>
          Recipes that need something you don&apos;t have never get suggested. Rice gets cooked in the rice cooker, not a saucepan.
        </p>
      </div>

      <div className="etal-card p-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <span className="text-[14px] font-bold">Heat</span>
          <span className="text-[12px]" style={{ color: "var(--soft)" }}>
            recipes spicier than this are never suggested
          </span>
        </div>
        <div className="flex gap-1.5">
          {["None", "Mild", "Warm", "Hot", "Burn"].map((label, i) => (
            <button
              key={label}
              onClick={() => setSpice(i)}
              className="flex-1 rounded-md py-2 text-[13px] font-bold transition-all duration-150 hover:-translate-y-0.5"
              style={{
                background: spice === i ? "var(--tomate)" : "var(--surface2)",
                color: spice === i ? "var(--on-color)" : "var(--soft)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="etal-card p-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <span className="text-[14px] font-bold">Pans you accept to wash</span>
          <span className="text-[12px]" style={{ color: "var(--soft)" }}>
            caps how many pots a recipe may use
          </span>
        </div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((p) => (
            <button
              key={p}
              onClick={() => setPans(p)}
              className="flex-1 rounded-md py-2 text-[13px] font-bold transition-all duration-150 hover:-translate-y-0.5"
              style={{
                background: pans === p ? "var(--aubergine)" : "var(--surface2)",
                color: pans === p ? "var(--on-color)" : "var(--soft)",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="etal-card p-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <span className="text-[14px] font-bold">Leftovers</span>
          <span className="text-[12px]" style={{ color: "var(--soft)" }}>
            how long you accept eating something you cooked on an earlier day
          </span>
        </div>
        <div className="flex gap-1.5">
          {[
            { v: 0, label: "Always fresh" },
            { v: 1, label: "Next day ok" },
            { v: 2, label: "Two days ok" },
            { v: 3, label: "Whatever" },
          ].map((o) => (
            <button
              key={o.v}
              onClick={() => setLeftovers(o.v)}
              className="flex-1 rounded-md py-2 text-[13px] font-bold transition-all duration-150 hover:-translate-y-0.5"
              style={{
                background: leftovers === o.v ? "var(--curcuma)" : "var(--surface2)",
                color: leftovers === o.v ? "var(--on-color)" : "var(--soft)",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="etal-card p-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <span className="text-[14px] font-bold">Weekly budget</span>
          <span className="text-[12px]" style={{ color: "var(--soft)" }}>
            fresh food only: oil, rice, pasta and spices are counted per gram used, not per pack
          </span>
        </div>
        <label className="flex items-center gap-3">
        <input
          type="range"
          min={40}
          max={200}
          step={5}
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
          className="flex-1 accent-[var(--feuille)]"
        />
          <span className="tabnum w-[64px] text-right text-[16px] font-bold">{budget} €</span>
        </label>
      </div>

      <button
        className="etal-btn etal-btn--color"
        style={{ "--c": "#137a42" } as React.CSSProperties}
        onClick={() =>
          onDone({
            equipment,
            spiceTolerance: spice,
            maxPans: pans,
            shoppingWeekday,
            weeklyBudgetEur: budget,
            leftoverTolerance: leftovers,
          })
        }
      >
        Build my first week
      </button>
    </div>
  );
}
