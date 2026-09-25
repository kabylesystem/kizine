import { currentUserId, needsWelcome } from "@/server/auth";
import { redirect } from "next/navigation";
import { rawDb } from "@/db/client";
import {getProfile} from "@/server/user";
import { Page, Band } from "@/ui/shell";
import { LineChart, RankedBars, type Series } from "@/ui/charts";
import { WeighIn } from "@/ui/weigh-in";
import { rollingAverage, trend, type WeightPoint } from "@/core/energy";
import { cuisineLabel } from "@/core/cuisines";
import { GOALS, type DailyLife, type GoalKind, type Sex } from "@/core/tdee";
import { horizon } from "@/core/training";
import { EnergyLab, type StoredCommute } from "@/ui/energy-lab";
import { getLang } from "@/server/lang";
import { ProteinBoard, type Family } from "@/ui/protein-board";
import { Fold } from "@/ui/fold";

export const dynamic = "force-dynamic";

const FISH = new Set(["salmon", "salmon-smoked", "cod", "white-fish", "tuna-canned", "sardines-canned", "mackerel-canned", "shrimp", "mussels", "squid"]);
const MEAT = new Set(["chicken-breast", "chicken-thigh", "chicken-drumstick", "turkey-escalope", "beef-steak", "beef-mince-5", "beef-mince-15", "beef-braising", "lamb-shoulder", "lamb-chops", "pork-loin", "duck-breast", "merguez", "chorizo", "lardons", "ham"]);
const DAIRY = new Set(["greek-yogurt", "yogurt-plain", "skyr", "fromage-blanc", "cottage-cheese", "ricotta", "mozzarella", "feta", "parmesan", "comte", "cheddar", "goat-cheese", "milk-semi", "milk-whole", "whey-protein"]);

const proteinFamily = (id: string): Family =>
  MEAT.has(id) ? "meat" : FISH.has(id) ? "fish" : id === "egg" ? "egg" : DAIRY.has(id) ? "dairy" : "plant";

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default async function Stats() {
  const lang = await getLang();
  const profile = await getProfile();
  if (await needsWelcome()) redirect("/welcome");
  if (!profile?.onboarded) redirect("/onboarding");
  const db = rawDb();

  const goal = await db.prepare("SELECT * FROM goals WHERE user_id = ?").get((await currentUserId())) as
    | Record<string, unknown>
    | undefined;
  const body = await db
    .prepare(
      "SELECT body_weight_kg, height_cm, age_years, body_fat_pct, daily_life, goal_kind, sex FROM nutrition_profiles WHERE user_id = ?",
    )
    .get((await currentUserId())) as
    | {
        body_weight_kg: number | null;
        height_cm: number | null;
        age_years: number | null;
        body_fat_pct: number | null;
        daily_life: string;
        goal_kind: string;
        sex: string | null;
      }
    | undefined;
  const goalKind = (body?.goal_kind ?? "bulkFast") as GoalKind;
  const weights = (
    await db.prepare("SELECT date, kg FROM weight_logs WHERE user_id = ? ORDER BY date").all((await currentUserId())) as unknown as WeightPoint[]
  ).map((w) => ({ date: String(w.date), kg: Number(w.kg) }));

  // Ce qui a été PRÉVU et ce qui a été CUISINÉ, jour par jour.
  const perDay = await db
    .prepare(
      `SELECT s.date,
              SUM(ri.kcal) AS planned_kcal,
              SUM(ri.protein_g) AS planned_protein,
              SUM(CASE WHEN m.state = 'cooked' THEN ri.kcal ELSE 0 END) AS eaten_kcal,
              SUM(CASE WHEN m.state = 'cooked' THEN ri.protein_g ELSE 0 END) AS eaten_protein,
              SUM(CASE WHEN m.state = 'cooked' THEN 1 ELSE 0 END) AS cooked,
              COUNT(*) AS planned
       FROM meal_slots s
       JOIN meal_plans p ON p.id = s.plan_id
       JOIN meals m ON m.slot_id = s.id
       JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       WHERE p.user_id = ?
       GROUP BY s.date ORDER BY s.date`,
    )
    .all(await currentUserId()) as unknown as {
    date: string;
    planned_kcal: number;
    planned_protein: number;
    eaten_kcal: number;
    eaten_protein: number;
    cooked: number;
    planned: number;
  }[];
  const days = perDay.map((d) => ({
    date: String(d.date),
    planned_kcal: Number(d.planned_kcal),
    planned_protein: Number(d.planned_protein),
    eaten_kcal: Number(d.eaten_kcal),
    eaten_protein: Number(d.eaten_protein),
    cooked: Number(d.cooked),
    planned: Number(d.planned),
  }));

  const cookedTotal = days.reduce((s, d) => s + d.cooked, 0);
  const plannedTotal = days.reduce((s, d) => s + d.planned, 0);
  const daysWithCooking = days.filter((d) => d.cooked > 0);

  const targetRate = goal ? Number(goal["target_gain_kg_per_week"]) : GOALS[goalKind].kgPerWeek;
  const verdict = trend(weights, targetRate);
  const avg = rollingAverage(weights);
  const startKg = goal ? Number(goal["start_kg"]) : (weights[0]?.kg ?? 62);
  const targetKg = goal ? Number(goal["target_kg"]) : Math.round((startKg + targetRate * (90 / 7)) * 2) / 2;

  const weightSeries: Series[] = [
    { name: "Weight, 7-day average", colorIndex: 0, points: avg.map((p) => ({ x: dayLabel(p.date), y: p.kg })) },
    {
      name: "On-target line",
      colorIndex: 1,
      points: avg.map((p, i) => ({ x: dayLabel(p.date), y: startKg + (targetRate / 7) * i })),
    },
  ];

  const energySeries: Series[] = [
    { name: "Planned", colorIndex: 1, points: days.map((d) => ({ x: dayLabel(d.date), y: d.planned_kcal })) },
    {
      name: "Actually eaten",
      colorIndex: 0,
      points: days.map((d) => ({ x: dayLabel(d.date), y: d.cooked > 0 ? d.eaten_kcal : null })),
    },
  ];

  const proteinSeries: Series[] = [
    { name: "Protein planned", colorIndex: 1, points: days.map((d) => ({ x: dayLabel(d.date), y: d.planned_protein })) },
    {
      name: "Protein eaten",
      colorIndex: 0,
      points: days.map((d) => ({ x: dayLabel(d.date), y: d.cooked > 0 ? d.eaten_protein : null })),
    },
  ];

  // Compter les repas mettait les pois chiches devant le poulet : un plat de poulet
  // aux pois chiches comptait pour les deux. On classe donc au poids réellement servi.
  const gramsRows = await db
    .prepare(
      `SELECT ri.grams AS grams FROM meals m JOIN recipe_instances ri ON ri.id = m.recipe_instance_id`,
    )
    .all() as unknown as { grams: string }[];
  const coreConcepts = new Map(
    (
      await db
        .prepare(
          `SELECT DISTINCT rin.concept_id AS id, ${lang === "fr" ? "c.name_fr" : "c.name_en"} AS label
           FROM recipe_ingredients rin JOIN food_concepts c ON c.id = rin.concept_id
           WHERE rin.role = 'protein_core'`,
        )
        .all() as unknown as { id: string; label: string }[]
    ).map((r) => [String(r.id), String(r.label)]),
  );
  const gramsByConcept = new Map<string, number>();
  for (const row of gramsRows) {
    let parsed: Record<string, number>;
    try {
      parsed = typeof row.grams === "string" ? JSON.parse(row.grams) : (row.grams as never);
    } catch {
      continue;
    }
    for (const [conceptId, g] of Object.entries(parsed ?? {})) {
      if (!coreConcepts.has(conceptId)) continue;
      gramsByConcept.set(conceptId, (gramsByConcept.get(conceptId) ?? 0) + Number(g));
    }
  }
  const proteins = [...gramsByConcept.entries()]
    .map(([id, g]) => ({
      id,
      label: coreConcepts.get(id) ?? id,
      kg: Math.round((g / 1000) * 10) / 10,
      family: proteinFamily(id),
    }))
    .filter((r) => r.kg > 0)
    .sort((a, b) => b.kg - a.kg)
    .slice(0, 8);

  const topCuisines = await db
    .prepare(
      `SELECT r.cuisine AS label, COUNT(*) AS value
       FROM meals m JOIN recipe_instances ri ON ri.id = m.recipe_instance_id
       JOIN recipes r ON r.id = ri.recipe_id
       GROUP BY r.cuisine ORDER BY value DESC LIMIT 8`,
    )
    .all() as unknown as { label: string; value: number }[];
  const cuisines = topCuisines.map((r) => ({ label: cuisineLabel(String(r.label)), value: Number(r.value) }));

  const sessions = (
    await db
      .prepare("SELECT sport_id, per_week, minutes, block_minutes FROM training_sessions WHERE user_id = ?")
      .all((await currentUserId())) as unknown as {
      sport_id: string;
      per_week: number;
      minutes: number;
      block_minutes: string | null;
    }[]
  ).map((r) => ({
    sportId: String(r.sport_id),
    perWeek: Number(r.per_week),
    blockMinutes: r.block_minutes ? (JSON.parse(String(r.block_minutes)) as Record<string, number>) : undefined,
  }));

  const commutes: StoredCommute[] = (
    await db
      .prepare(
        "SELECT id, label, km, mode, trips_per_week, minutes_one_way, from_address, to_address FROM commutes WHERE user_id = ?",
      )
      .all((await currentUserId())) as unknown as {
      id: string;
      label: string;
      km: number;
      mode: string;
      trips_per_week: number;
      minutes_one_way: number | null;
      from_address: string | null;
      to_address: string | null;
    }[]
  ).map((r) => ({
    id: String(r.id),
    label: String(r.label),
    km: Number(r.km),
    mode: String(r.mode) as StoredCommute["mode"],
    tripsPerWeek: Number(r.trips_per_week),
    minutesOneWay: r.minutes_one_way === null ? null : Number(r.minutes_one_way),
    fromAddress: r.from_address === null ? null : String(r.from_address),
    toAddress: r.to_address === null ? null : String(r.to_address),
  }));

  const latest = weights[weights.length - 1]?.kg ?? startKg;
  const gained = latest - startKg;
  const avgEaten =
    daysWithCooking.length > 0
      ? daysWithCooking.reduce((s, d) => s + d.eaten_kcal, 0) / daysWithCooking.length
      : null;

  const endDate = goal ? String(goal["end_date"]) : null;
  const daysLeft = endDate
    ? Math.max(0, Math.round((Date.parse(endDate) - Date.now()) / 86400000))
    : 90;
  const view = horizon(latest, targetKg, targetRate, verdict.observedKgPerWeek, daysLeft);

  const weightKg = body?.body_weight_kg ?? latest;

  return (
    <Page>
      <Band title="Numbers" color="var(--aubergine)" />

      <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px]" style={{ color: "var(--soft)" }}>
        <span>
          <b className="tabnum" style={{ color: "var(--ink)" }}>{latest.toFixed(1)} kg</b> {lang === "fr" ? "aujourd'hui" : "now"}
        </span>
        <span>
          <b className="tabnum" style={{ color: gained >= 0 ? "var(--feuille)" : "var(--curcuma)" }}>
            {gained >= 0 ? "+" : ""}
            {gained.toFixed(1)} kg
          </b>{" "}
          {lang === "fr" ? `depuis ${startKg} kg` : `since ${startKg} kg`}
        </span>
        {plannedTotal > 0 ? (
          <span>
            <b className="tabnum" style={{ color: "var(--ink)" }}>{Math.round((cookedTotal / plannedTotal) * 100)} %</b>{" "}
            {lang === "fr" ? "des repas prévus cuisinés" : "of planned meals cooked"}
          </span>
        ) : null}
        {avgEaten !== null ? (
          <span>
            <b className="tabnum" style={{ color: "var(--ink)" }}>{Math.round(avgEaten)}</b>{" "}
            {lang === "fr" ? "kcal par jour cuisiné" : "kcal per cooking day"}
          </span>
        ) : null}
      </p>

      <div className="mb-4">
        <WeighIn last={latest} />
      </div>

      <Section
        title={lang === "fr" ? "Ce que tu brûles vraiment" : "What you actually burn"}
        note={
          lang === "fr"
            ? "Chaque poste est calculé à part, avec sa source. Pas de multiplicateur unique qui met le yoga et le MMA dans la même case."
            : "Every line is computed separately, with its source. No single multiplier that files yoga and MMA under the same number."
        }
      >
        <EnergyLab
          lang={lang}
          weightKg={weightKg}
          heightCm={body?.height_cm ?? 174}
          ageYears={body?.age_years ?? 23}
          bodyFatPct={body?.body_fat_pct ?? null}
          dailyLife={(body?.daily_life ?? "mixed") as DailyLife}
          goalKind={goalKind}
          sex={(body?.sex ?? "m") as Sex}
          currentTarget={Math.round(profile.kcalTarget)}
          targetKg={targetKg}
          breakfastDays={profile.breakfastDaysPerWeek}
          savedRate={targetRate}
          sessions={sessions}
          commutes={commutes}
          macros={null}
        />
      </Section>

      <div
        className="mb-4 rounded-[7px] p-4"
        style={{ background: "var(--aubergine)", color: "var(--on-color)" }}
      >
        <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
          {view.days} days left
        </div>
        <div className="mt-1 flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <div className="display tabnum text-[38px] leading-none">
              {(view.atObservedPace ?? view.atTargetPace).toFixed(1)} kg
            </div>
            <div className="mt-1 text-[12px] font-semibold opacity-90">
              {view.atObservedPace === null ? "on the planned pace" : "at the pace the scale shows"}
            </div>
          </div>
          <div>
            <div className="display tabnum text-[24px] leading-none opacity-90">{view.targetKg} kg</div>
            <div className="mt-0.5 text-[12px] font-semibold opacity-80">the goal</div>
          </div>
          {view.gapKg !== null ? (
            <div>
              <div className="display tabnum text-[24px] leading-none opacity-90">
                {view.gapKg > 0 ? "+" : ""}
                {view.gapKg} kg
              </div>
              <div className="mt-0.5 text-[12px] font-semibold opacity-80">gap at day {view.days}</div>
            </div>
          ) : null}
        </div>
        <p className="mt-2 max-w-[62ch] text-[13px] leading-snug opacity-95">{view.message}</p>
      </div>

      <h2
        className="mb-2 mt-6 text-[13px] font-bold uppercase tracking-wider"
        style={{ color: "var(--soft)" }}
      >
        {lang === "fr" ? "Statistiques" : "Statistics"}
      </h2>

      <Fold title="Weight, and where it should be" note={verdict.message}>
        <LineChart series={weightSeries} unit="kg" decimals={1} rule={targetKg} ruleLabel={`goal ${targetKg} kg`} />
      </Fold>

      <Fold title="Energy, planned against eaten" note={`Target ${Math.round(profile.kcalTarget)} kcal a day.`}>
        <LineChart series={energySeries} unit="kcal" rule={profile.kcalTarget} ruleLabel="daily target" />
      </Fold>

      <Fold title="Protein" note={`Target ${Math.round(profile.proteinTargetG)} g a day.`}>
        <LineChart series={proteinSeries} unit="g" rule={profile.proteinTargetG} ruleLabel="daily target" />
      </Fold>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Section
          title={lang === "fr" ? "Ce qui te nourrit vraiment" : "What actually feeds you"}
          note={
            lang === "fr"
              ? "Au poids servi, pas au nombre de plats : une garniture de pois chiches ne passe jamais devant la viande."
              : "By weight served, not by dish count, so a side of chickpeas never outranks the meat."
          }
        >
          <ProteinBoard rows={proteins} lang={lang} />
        </Section>
        <Section title="Cuisines" note="How wide the rotation actually is.">
          <RankedBars rows={cuisines} unit="meals" />
        </Section>
      </div>
    </Page>
  );
}


function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="etal-card mb-4 p-4">
      <div className="mb-3">
        <h2 className="text-[17px]">{title}</h2>
        {note ? (
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--soft)" }}>
            {note}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
