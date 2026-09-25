import { currentUserId } from "@/server/auth";
import { rawDb } from "@/db/client";
import { maintenanceEnergy, trend, type WeightPoint } from "@/core/energy";

/** Trajectoire 90 jours : la cible choisie contre l'objectif réel, sans arrondir la vérité. */
export async function GoalCard({ kcalTarget }: { kcalTarget: number }) {
  const db = rawDb();
  const goal = await db.prepare("SELECT * FROM goals WHERE user_id = ?").get((await currentUserId())) as
    | Record<string, unknown>
    | undefined;
  if (!goal) return null;

  const profile = await db
    .prepare("SELECT body_weight_kg, height_cm FROM nutrition_profiles WHERE user_id = ?")
    .get((await currentUserId())) as { body_weight_kg: number | null; height_cm: number | null } | undefined;

  const logs = (
    await db.prepare("SELECT date, kg FROM weight_logs WHERE user_id = ? ORDER BY date").all((await currentUserId())) as unknown as
      WeightPoint[]
  );

  const startKg = Number(goal["start_kg"]);
  const targetKg = Number(goal["target_kg"]);
  const endDate = String(goal["end_date"]);
  const targetRate = Number(goal["target_gain_kg_per_week"]);
  const latest = logs[logs.length - 1]?.kg ?? startKg;
  const progress = Math.max(0, Math.min(1, (latest - startKg) / Math.max(0.1, targetKg - startKg)));

  const maintenance =
    profile?.body_weight_kg && profile.height_cm
      ? maintenanceEnergy({
          weightKg: profile.body_weight_kg,
          heightCm: profile.height_cm,
          ageYears: 23,
          sex: "m",
          activityFactor: 1.725,
        })
      : null;

  const impliedRate = maintenance === null ? null : ((kcalTarget - maintenance) * 7) / 6500;
  const impliedIn90 = impliedRate === null ? null : impliedRate * (90 / 7);
  const neededTarget = maintenance === null ? null : Math.round((maintenance + (targetRate * 6500) / 7) / 10) * 10;
  const t = trend(logs, targetRate);

  return (
    <div className="mt-4 overflow-hidden rounded-[9px]" style={{ background: "var(--surface)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <h2 className="text-[17px]">90 days</h2>
        <span className="text-[12px] font-semibold" style={{ color: "var(--soft)" }}>
          {startKg} kg → {targetKg} kg by {endDate}
        </span>
      </div>

      <div className="px-4 pt-3">
        <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface2)" }}>
          <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: "var(--feuille)" }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px p-4 sm:grid-cols-4">
        <Stat value={`${latest} kg`} label="latest weigh-in" />
        <Stat value={impliedRate === null ? "—" : `${impliedRate.toFixed(2)} kg/wk`} label={`at ${kcalTarget} kcal`} />
        <Stat
          value={impliedIn90 === null ? "—" : `+${impliedIn90.toFixed(1)} kg`}
          label="projected in 90 days"
          color={impliedIn90 !== null && impliedIn90 < targetKg - startKg - 0.5 ? "var(--curcuma)" : undefined}
        />
        <Stat value={neededTarget === null ? "—" : `${neededTarget} kcal`} label="to actually hit the goal" color="var(--tomate)" />
      </div>

      <p className="px-4 pb-4 text-[13px]" style={{ color: "var(--soft)" }}>
        {t.message}
      </p>
    </div>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div>
      <div className="display tabnum text-[24px] leading-none" style={{ color: color ?? "var(--ink)" }}>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-semibold" style={{ color: "var(--soft)" }}>
        {label}
      </div>
    </div>
  );
}
