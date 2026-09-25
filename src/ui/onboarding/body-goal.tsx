"use client";

import { useMemo, useState } from "react";
import { maintenanceEnergy, restingEnergy } from "@/core/energy";
import { GOALS, planFor, type GoalKind, type Sex } from "@/core/tdee";

export interface BodyValues {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
  activityFactor: number;
  goalKind: GoalKind;
  kgPerWeek: number;
  proteinPerKg: number;
  kcalTarget: number;
  proteinTarget: number;
}

interface Props {
  initial?: Omit<BodyValues, "sex"> & { sex: Sex | null };
  onDone: (body: BodyValues) => void;
}

const ACTIVITY = [
  { v: 1.375, label: "Light", hint: "1 to 3 sessions" },
  { v: 1.55, label: "Moderate", hint: "3 to 5 sessions" },
  { v: 1.725, label: "Hard", hint: "6 to 7 sessions" },
  { v: 1.9, label: "Athlete", hint: "twice a day" },
];

const GOAL_ORDER: GoalKind[] = ["cut", "maintain", "bulk", "bulkFast"];

const RATE_RANGE: Record<GoalKind, { min: number; max: number }> = {
  cut: { min: -1, max: -0.2 },
  maintain: { min: 0, max: 0 },
  bulk: { min: 0.1, max: 0.5 },
  bulkFast: { min: 0.5, max: 1.2 },
};

const PROTEIN_DEFAULT: Record<GoalKind, number> = { cut: 2.4, maintain: 1.8, bulk: 2.2, bulkFast: 2.2 };

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Field({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step = 1,
  display,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit: string;
  min: number;
  max: number;
  step?: number;
  display?: string;
}) {
  return (
    <label className="etal-card flex items-center gap-3 p-3">
      <span className="w-[92px] shrink-0 text-[14px] font-bold">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[var(--argile)]"
      />
      <span className="tabnum w-[84px] text-right text-[16px] font-bold">
        {display ?? value}
        <span className="pl-1 text-[12px] font-semibold" style={{ color: "var(--soft)" }}>
          {unit}
        </span>
      </span>
    </label>
  );
}

function Choice({
  options,
  value,
  onPick,
  color = "var(--feuille)",
}: {
  options: { v: string; label: string; hint?: string }[];
  value: string | null;
  onPick: (v: string) => void;
  color?: string;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onPick(o.v)}
            aria-pressed={on}
            className="flex-1 rounded-md px-2 py-2 text-center transition-all duration-150 hover:-translate-y-0.5"
            style={{ background: on ? color : "var(--surface2)", color: on ? "var(--on-color)" : "var(--soft)" }}
          >
            <div className="text-[13px] font-bold">{o.label}</div>
            {o.hint ? <div className="text-[10px] opacity-75">{o.hint}</div> : null}
          </button>
        );
      })}
    </div>
  );
}

export function BodyGoal({ onDone, initial }: Props) {
  const [sex, setSex] = useState<Sex | null>(initial?.sex ?? null);
  const [weightKg, setWeight] = useState(initial?.weightKg ?? 65);
  const [heightCm, setHeight] = useState(initial?.heightCm ?? 170);
  const [ageYears, setAge] = useState(initial?.ageYears ?? 25);
  const [activityFactor, setActivity] = useState(initial?.activityFactor ?? 1.55);
  const [goalKind, setGoalKind] = useState<GoalKind>(initial?.goalKind ?? "maintain");
  const [kgPerWeek, setRate] = useState(initial?.kgPerWeek ?? GOALS[initial?.goalKind ?? "maintain"].kgPerWeek);
  const [proteinPerKg, setProteinPerKg] = useState(initial?.proteinPerKg ?? PROTEIN_DEFAULT[initial?.goalKind ?? "maintain"]);

  const body = { weightKg, heightCm, ageYears, sex: sex ?? "f", activityFactor };
  const bmr = useMemo(() => Math.round(restingEnergy(body)), [weightKg, heightCm, ageYears, sex]);
  const maintenance = useMemo(() => Math.round(maintenanceEnergy(body)), [weightKg, heightCm, ageYears, sex, activityFactor]);
  const plan = useMemo(() => planFor(maintenance, weightKg, kgPerWeek, null), [maintenance, weightKg, kgPerWeek]);
  const protein = Math.round(weightKg * proteinPerKg);
  const in90 = (weightKg + kgPerWeek * (90 / 7)).toFixed(1);
  const range = RATE_RANGE[goalKind];

  function pickGoal(k: GoalKind) {
    setGoalKind(k);
    setRate(GOALS[k].kgPerWeek);
    setProteinPerKg(PROTEIN_DEFAULT[k]);
  }

  const deltaLabel =
    plan.deltaKcal > 0 ? `+${plan.deltaKcal}` : plan.deltaKcal < 0 ? `${plan.deltaKcal}` : "0";
  const deltaName = plan.deltaKcal > 0 ? "surplus" : plan.deltaKcal < 0 ? "deficit" : "at maintenance";

  return (
    <div className="flex w-full max-w-[620px] flex-col gap-3">
      <div className="etal-card p-3">
        <div className="mb-2 text-[14px] font-bold">You</div>
        <Choice
          options={[
            { v: "f", label: "Woman" },
            { v: "m", label: "Man" },
          ]}
          value={sex}
          onPick={(v) => setSex(v as Sex)}
        />
      </div>

      <Field label="Weight" value={weightKg} onChange={setWeight} unit="kg" min={40} max={150} step={0.5} />
      <Field label="Height" value={heightCm} onChange={setHeight} unit="cm" min={140} max={210} />
      <Field label="Age" value={ageYears} onChange={setAge} unit="yr" min={14} max={80} />

      <div className="etal-card p-3">
        <div className="mb-2 text-[14px] font-bold">Training</div>
        <Choice
          options={ACTIVITY.map((a) => ({ v: String(a.v), label: a.label, hint: a.hint }))}
          value={String(activityFactor)}
          onPick={(v) => setActivity(Number(v))}
        />
      </div>

      <div className="etal-card p-3">
        <div className="mb-2 text-[14px] font-bold">What you are after</div>
        <Choice
          options={GOAL_ORDER.map((k) => ({ v: k, label: capitalize(GOALS[k].label) }))}
          value={goalKind}
          onPick={(v) => pickGoal(v as GoalKind)}
          color="var(--argile)"
        />
      </div>

      {goalKind !== "maintain" ? (
        <Field
          label={goalKind === "cut" ? "Lose" : "Gain"}
          value={kgPerWeek}
          onChange={setRate}
          unit="kg/wk"
          min={range.min}
          max={range.max}
          step={0.05}
          display={Math.abs(kgPerWeek).toFixed(2)}
        />
      ) : null}
      <Field label="Protein" value={proteinPerKg} onChange={setProteinPerKg} unit="g/kg" min={1.2} max={2.8} step={0.05} />

      <div
        className="overflow-hidden rounded-[7px] transition-opacity"
        style={{ background: "var(--argile)", color: "var(--on-color)", opacity: sex ? 1 : 0.55 }}
      >
        <div className="p-4">
          <div className="display text-[52px] leading-none tabnum">{plan.targetKcal}</div>
          <div className="mt-1 text-[15px] font-semibold opacity-90">kcal per day · {protein} g protein</div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
            <div>
              <div className="tabnum text-[19px] font-bold">{bmr}</div>
              <div className="opacity-80">resting</div>
            </div>
            <div>
              <div className="tabnum text-[19px] font-bold">{maintenance}</div>
              <div className="opacity-80">maintenance</div>
            </div>
            <div>
              <div className="tabnum text-[19px] font-bold">{deltaLabel}</div>
              <div className="opacity-80">{deltaName}</div>
            </div>
          </div>
          <div className="mt-3 text-[13px] opacity-90">
            {goalKind === "maintain"
              ? `You stay around ${weightKg} kg. The target is your maintenance.`
              : `At ${kgPerWeek > 0 ? "+" : ""}${kgPerWeek.toFixed(2)} kg per week you are ${in90} kg in 90 days.`}
            {sex ? "" : " Pick woman or man above: the resting formula differs."}
          </div>
          {plan.warning ? <div className="mt-2 text-[13px] font-semibold">{plan.warning}</div> : null}
        </div>
      </div>

      <button
        className="etal-btn etal-btn--color disabled:opacity-40"
        style={{ "--c": "var(--argile)" } as React.CSSProperties}
        disabled={!sex}
        onClick={() =>
          sex &&
          onDone({
            weightKg,
            heightCm,
            ageYears,
            sex,
            activityFactor,
            goalKind,
            kgPerWeek,
            proteinPerKg,
            kcalTarget: plan.targetKcal,
            proteinTarget: protein,
          })
        }
      >
        {sex ? "Lock these numbers" : "Pick woman or man first"}
      </button>
    </div>
  );
}
