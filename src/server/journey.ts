import { currentUserId } from "@/server/auth";
import { rawDb } from "@/db/client";


export type StepId = "approve" | "shop" | "stock" | "cook";

export interface Step {
  id: StepId;
  href: string;
  label: string;
  labelFr: string;
  detail: string;
  detailFr: string;
  done: boolean;
  current: boolean;
}

/**
 * Le cycle de la semaine, dans l'ordre où il se vit : on choisit ses plats,
 * on achète, on range, on cuisine. Sans ça les écrans existaient chacun dans
 * leur coin et il fallait deviner par où commencer.
 */
export async function weekJourney(weekStart: string): Promise<Step[]> {
  const db = rawDb();
  const [meals, locked, cooked] = await Promise.all([
    db
      .prepare(
        `SELECT SUM(CASE WHEN m.state = 'planned' THEN 1 ELSE 0 END) AS pending,
                COUNT(*) AS total
         FROM meal_slots s JOIN meal_plans p ON p.id = s.plan_id JOIN meals m ON m.slot_id = s.id
         WHERE p.user_id = ? AND p.week_start = ?`,
      )
      .get((await currentUserId()), weekStart) as Promise<{ pending: number; total: number } | undefined>,
    db
      .prepare("SELECT basket_locked_at FROM meal_plans WHERE user_id = ? AND week_start = ?")
      .get((await currentUserId()), weekStart) as Promise<{ basket_locked_at: number | null } | undefined>,
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM meal_slots s JOIN meal_plans p ON p.id = s.plan_id
         JOIN meals m ON m.slot_id = s.id
         WHERE p.user_id = ? AND p.week_start = ? AND m.state IN ('cooked','skipped')`,
      )
      .get((await currentUserId()), weekStart) as Promise<{ n: number } | undefined>,
  ]);

  const pending = Number(meals?.pending ?? 0);
  const total = Number(meals?.total ?? 0);
  const shopped = (locked?.basket_locked_at ?? null) !== null;
  const stocked = Number(
    (
      (await db
        .prepare("SELECT COUNT(*) AS n FROM pantry_items WHERE user_id = ? AND quantity_g > 0")
        .get((await currentUserId()))) as { n: number } | undefined
    )?.n ?? 0,
  );
  const cookedCount = Number(cooked?.n ?? 0);

  const approved = total > 0 && pending === 0;
  const steps: Omit<Step, "current">[] = [
    {
      id: "approve",
      href: "/approve",
      label: "Choose the dishes",
      labelFr: "Choisir les plats",
      detail: approved ? "every dish decided" : `${pending} still to decide`,
      detailFr: approved ? "tous les plats sont tranchés" : `${pending} plats à trancher`,
      done: approved,
    },
    {
      id: "shop",
      href: "/groceries",
      label: "Do the shopping",
      labelFr: "Faire les courses",
      detail: shopped ? "bought" : approved ? "the list is ready" : "waiting on your dishes",
      detailFr: shopped ? "achetées" : approved ? "la liste est prête" : "en attente de tes plats",
      done: shopped,
    },
    {
      id: "stock",
      href: "/pantry",
      label: "Put it away",
      labelFr: "Ranger",
      detail: stocked > 0 ? `${stocked} things in stock` : "nothing in stock yet",
      detailFr: stocked > 0 ? `${stocked} produits en stock` : "rien en stock",
      done: shopped && stocked > 0,
    },
    {
      id: "cook",
      href: "/",
      label: "Cook, day by day",
      labelFr: "Cuisiner, jour après jour",
      detail: cookedCount > 0 ? `${cookedCount} of ${total} cooked` : "nothing cooked yet",
      detailFr: cookedCount > 0 ? `${cookedCount} repas sur ${total}` : "rien de cuisiné",
      done: total > 0 && cookedCount >= total,
    },
  ];

  const firstUndone = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => ({ ...s, current: i === (firstUndone === -1 ? steps.length - 1 : firstUndone) }));
}
