import { currentUserId } from "@/server/auth";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { rawDb } from "@/db/client";
import { planningWeek } from "@/server/plan-service";
import { buildListFor } from "@/server/grocery-service";

/**
 * « Courses faites » : la liste devient du stock.
 * C'est le mécanisme qui remplit le garde-manger sans jamais rien taper à la main.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { undo?: string };
  const db0 = rawDb();

  // Annulation : on retire exactement les lots créés par ce passage en caisse.
  if (body.undo) {
    const items = await db0
      .prepare("SELECT item_id FROM inventory_events WHERE kind = 'purchase' AND reason_ref = ?")
      .all(body.undo) as unknown as { item_id: string }[];
    if (items.length === 0) return NextResponse.json({ error: "rien à annuler" }, { status: 404 });
    try {
      await db0.tx(async (trx) => {
        for (const i of items) await trx.prepare("DELETE FROM pantry_items WHERE id = ?").run(i.item_id);
        await trx.prepare("DELETE FROM inventory_events WHERE reason_ref = ?").run(body.undo);
        // Le panier redevient modifiable : on n'a plus rien acheté.
        await trx.prepare("UPDATE meal_plans SET basket_locked_at = NULL WHERE user_id = ?").run((await currentUserId()));
      });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, undone: items.length });
  }

  const weekStart = await planningWeek();
  const data = await buildListFor(weekStart);
  if (!data) return NextResponse.json({ error: "aucun plan" }, { status: 404 });

  const db = rawDb();
  const now = Math.floor(Date.now() / 1000);
  const today = new Date();

  const conceptMeta = new Map(
    (
      await db
        .prepare("SELECT id, perishability_days, perishability_open_days, freezable, category FROM food_concepts")
        .all() as unknown as {
        id: string;
        perishability_days: number;
        perishability_open_days: number | null;
        freezable: number;
        category: string;
      }[]
    ).map((r) => [r.id, r]),
  );

  const locationFor = (category: string, freezable: boolean, keepDays: number): string => {
    if (keepDays <= 10 && ["protein", "dairy", "vegetable", "fruit"].includes(category)) return "fridge";
    if (freezable && keepDays <= 5) return "freezer";
    return "pantry";
  };

  const batch = `shopping:${randomUUID()}`;
  let added = 0;
  try {
    await db.tx(async (trx) => {
      const insert = trx.prepare(
        `INSERT INTO pantry_items (id, user_id, location_id, concept_id, barcode, quantity_g, initial_g,
          opened_at, purchased_at, best_before, frozen, portioned_from_id, confidence, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      const event = trx.prepare(
        "INSERT INTO inventory_events (item_id, kind, delta_g, reason_ref, at) VALUES (?,?,?,?,?)",
      );

      for (const line of [...data.list.lines, ...data.list.pantryCheck]) {
        if (line.boughtG <= 0) continue;
        const meta = conceptMeta.get(line.conceptId);
        if (!meta) continue;
        const keepDays = meta.perishability_days;
        const kind = locationFor(meta.category, meta.freezable === 1, keepDays);
        const best = new Date(today);
        best.setDate(best.getDate() + Math.min(keepDays, 365));
        const id = randomUUID();
        await insert.run(
          id,
          (await currentUserId()),
          `${(await currentUserId())}:${kind}`,
          line.conceptId,
          null,
          line.boughtG,
          line.boughtG,
          null,
          now,
          best.toISOString().slice(0, 10),
          kind === "freezer" ? 1 : 0,
          null,
          0.85,
          now,
        );
        await event.run(id, "purchase", line.boughtG, batch, now);
        added++;
      }

      await trx.prepare("UPDATE grocery_lists SET status = 'done' WHERE id IN (SELECT id FROM grocery_lists)").run();
      // À partir d'ici les plats de la semaine sont dans le frigo : le planificateur
      // n'a plus le droit d'en inventer d'autres, il permute.
      await trx.prepare("UPDATE meal_plans SET basket_locked_at = ? WHERE user_id = ? AND week_start = ?").run(
        now,
        (await currentUserId()),
        weekStart,
      );
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, added, batch });
}
