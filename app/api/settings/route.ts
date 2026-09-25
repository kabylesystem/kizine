import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { rawDb } from "@/db/client";
import { normalizeSplit } from "@/core/schedule";
import { currentWeek, planningWeek } from "@/server/plan-service";
import { retargetWeek } from "@/server/retarget";

/** Un seul endroit pour tous les réglages du profil, un champ à la fois. */
const schema = z.object({
  breakfastDaysPerWeek: z.number().int().min(-1).max(7).optional(),
  snackDaysPerWeek: z.number().int().min(-1).max(7).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  shoppingWeekday: z.number().int().min(0).max(6).optional(),
  meatPerMainMealG: z.number().min(0).max(600).optional(),
  weeklyBudgetEur: z.number().min(0).max(500).nullable().optional(),
  spiceTolerance: z.number().int().min(0).max(4).optional(),
  maxPans: z.number().int().min(1).max(4).optional(),
  kcalTarget: z.number().min(1200).max(7000).optional(),
  proteinTargetG: z.number().min(40).max(400).optional(),
  /** Part de chaque repas dans la journée. null = revenir aux parts par défaut. */
  kcalSplit: z
    .object({
      breakfast: z.number().min(0).max(1),
      lunch: z.number().min(0).max(1),
      snack: z.number().min(0).max(1),
      dinner: z.number().min(0).max(1),
    })
    .nullable()
    .optional(),
});

/** Ce qui change la taille des assiettes : la semaine en cours est redosée dans la foulée. */
const RETARGETS = new Set(["kcalTarget", "proteinTargetG", "kcalSplit"]);

const COLUMN: Record<keyof z.infer<typeof schema>, string> = {
  breakfastDaysPerWeek: "breakfast_days_per_week",
  snackDaysPerWeek: "snack_days_per_week",
  weekStartsOn: "week_starts_on",
  shoppingWeekday: "shopping_weekday",
  meatPerMainMealG: "meat_per_main_meal_g",
  weeklyBudgetEur: "weekly_budget_eur",
  spiceTolerance: "spice_tolerance",
  maxPans: "max_pans",
  kcalTarget: "kcal_target",
  proteinTargetG: "protein_target_g",
  kcalSplit: "kcal_split",
};

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return NextResponse.json({ ok: true, changed: 0 });

  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);
  try {
    await db.tx(async (trx) => {
      for (const [key, value] of entries) {
        const col = COLUMN[key as keyof typeof COLUMN];
        const stored =
          key === "kcalSplit"
            ? (() => {
                const split = normalizeSplit(value as Record<string, number> | null);
                return split ? JSON.stringify(split) : null;
              })()
            : (value as number | null);
        await trx
          .prepare(`UPDATE nutrition_profiles SET ${col} = ?, updated_at = ? WHERE user_id = ?`)
          .run(stored, now, (await currentUserId()));
      }
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  let retargeted = 0;
  if (entries.some(([key]) => RETARGETS.has(key))) {
    try {
      const weeks = new Set([await currentWeek(), await planningWeek()]);
      for (const week of weeks) retargeted += (await retargetWeek(week)).retargeted;
    } catch (err) {
      return NextResponse.json({ ok: true, changed: entries.length, retargeted, warning: (err as Error).message });
    }
  }
  return NextResponse.json({ ok: true, changed: entries.length, retargeted });
}
