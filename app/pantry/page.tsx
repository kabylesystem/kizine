import { currentUserId, needsWelcome } from "@/server/auth";
import { redirect } from "next/navigation";
import { rawDb } from "@/db/client";
import {getProfile} from "@/server/user";
import { Page, Band } from "@/ui/shell";
import { Scanner } from "@/ui/scanner";
import { getLang } from "@/server/lang";
import { weekJourney } from "@/server/journey";
import { planningWeekOf } from "@/server/plan-service";
import { Journey } from "@/ui/journey";
import { formatGrams } from "@/core/grocery";

export const dynamic = "force-dynamic";

const KIND_COLOR: Record<string, string> = {
  pantry: "var(--curcuma)",
  fridge: "var(--myrtille)",
  freezer: "var(--aubergine)",
};

export default async function Pantry() {
  const lang = await getLang();
  const profile = await getProfile();
  if (await needsWelcome()) redirect("/welcome");
  if (!profile?.onboarded) redirect("/onboarding");
  const steps = await weekJourney(planningWeekOf(new Date(), profile.weekStartsOn));

  const rows = await rawDb()
    .prepare(
      `SELECT p.id, p.quantity_g, p.initial_g, p.best_before, p.frozen, p.confidence,
              c.name_en, c.name_fr, l.kind, o.brand, o.name AS product_name
       FROM pantry_items p
       JOIN food_concepts c ON c.id = p.concept_id
       JOIN storage_locations l ON l.id = p.location_id
       LEFT JOIN off_products o ON o.barcode = p.barcode
       WHERE p.user_id = ? AND p.quantity_g > 0
       ORDER BY COALESCE(p.best_before, '9999-12-31')`,
    )
    .all((await currentUserId())) as unknown as {
    id: string;
    quantity_g: number;
    initial_g: number;
    best_before: string | null;
    frozen: number;
    confidence: number;
    name_en: string;
    name_fr: string;
    kind: string;
    brand: string | null;
    product_name: string | null;
  }[];

  return (
    <Page>
      <Band title="Stock" note={`${rows.length} items`} color="var(--curcuma)" />

      <Journey steps={steps} lang={lang} />

      <div className="mb-3">
        <Scanner />
      </div>
      {rows.length === 0 ? (
        <div className="etal-card p-5">
          <h2 className="mb-2 text-[19px]">Nothing tracked yet</h2>
          <p className="text-[15px]" style={{ color: "var(--soft)" }}>
            Stock fills itself: check off the shopping list, cook a meal, scan a barcode. Nothing here is typed by hand,
            which is exactly why it does not get abandoned after ten days.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const days = r.best_before ? Math.round((Date.parse(r.best_before) - Date.now()) / 86400000) : null;
            const urgent = days !== null && days <= 3;
            return (
              <div key={r.id} className="etal-card flex items-center gap-3 p-3">
                <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[r.kind] ?? "var(--soft)" }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold">{lang === "fr" ? r.name_fr : r.name_en}</div>
                  <div className="text-[12px]" style={{ color: urgent ? "var(--tomate)" : "var(--soft)" }}>
                    {r.brand ? `${r.brand} · ` : ""}
                    {r.kind}
                    {days !== null ? ` · ${days <= 0 ? "expired" : `${days} days left`}` : ""}
                    {r.confidence < 1 ? ` · approximate` : ""}
                  </div>
                </div>
                <div className="display tabnum shrink-0 text-[18px]">{formatGrams(r.quantity_g)}</div>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}
