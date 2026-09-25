import { currentUserId, needsWelcome } from "@/server/auth";
import { redirect } from "next/navigation";
import { getProfile } from "@/server/user";
import { planningWeekOf } from "@/server/plan-service";
import { getLang } from "@/server/lang";
import { weekJourney } from "@/server/journey";
import { Journey } from "@/ui/journey";
import { CupboardChip } from "@/ui/cupboard-chip";
import { SHELF_TIPS } from "@/data/shelf-tips";
import { ShelfTip } from "@/ui/shelf-tip";
import { buildListFor } from "@/server/grocery-service";
import { Page, Band } from "@/ui/shell";
import { formatGrams, formatPackages } from "@/core/grocery";
import { ShoppingDone } from "@/ui/shopping-done";
import { FoodMenu } from "@/ui/food-menu";
import { PriceTag } from "@/ui/price-tag";
import { rawDb } from "@/db/client";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Deux arrêts, pas onze rayons : default-user achète tout à l'Intermarché sauf
 * la viande, qu'il prend chez son boucher. La liste suit son trajet réel.
 */
const STOPS = [
  {
    id: "boucherie",
    label: "Butcher",
    labelFr: "Boucherie",
    note: "meat and fish, bought fresh at the counter",
    noteFr: "viande et poisson, au comptoir",
    color: "var(--tomate)",
    aisles: ["boucherie", "poissonnerie"],
  },
  {
    id: "intermarche",
    label: "Intermarché",
    labelFr: "Intermarché",
    note: "everything else, rue de Vouillé",
    noteFr: "tout le reste, rue de Vouillé",
    color: "var(--feuille)",
    aisles: ["primeur", "frais", "charcuterie", "boulangerie", "epicerie", "conserves", "monde", "surgeles", "apero"],
  },
] as const;

const AISLE_LABEL: Record<string, string> = {
  primeur: "Produce",
  boucherie: "Butcher",
  poissonnerie: "Fish",
  charcuterie: "Deli",
  frais: "Chilled",
  surgeles: "Frozen",
  boulangerie: "Bakery",
  epicerie: "Grocery",
  conserves: "Cans",
  monde: "World food",
  apero: "Snacks",
};

const AISLE_COLOR: Record<string, string> = {
  primeur: "var(--feuille)",
  boucherie: "var(--tomate)",
  poissonnerie: "var(--myrtille)",
  charcuterie: "var(--betterave)",
  frais: "var(--myrtille)",
  surgeles: "var(--myrtille)",
  boulangerie: "var(--curcuma)",
  epicerie: "var(--curcuma)",
  conserves: "var(--aubergine)",
  monde: "var(--aubergine)",
  apero: "var(--betterave)",
};

export default async function Groceries() {
  const profile = await getProfile();
  if (await needsWelcome()) redirect("/welcome");
  if (!profile?.onboarded) redirect("/onboarding");

  const data = await buildListFor(planningWeekOf(new Date(), profile.weekStartsOn));
  if (!data) {
    return (
      <Page>
        <Band title="Shopping" color="var(--feuille)" />
        <p className="etal-card p-4">No plan for this week yet.</p>
      </Page>
    );
  }

  const lang = await getLang();
  const steps = await weekJourney(data.weekStart);
  const { list, names } = data;

  // Ce qu'il a déjà déclaré avoir : on le garde visible pour pouvoir changer d'avis.
  const declaredHave = (
    await rawDb()
      .prepare("SELECT concept_id FROM pantry_declarations WHERE user_id = ? AND state = 'have'")
      .all((await currentUserId())) as unknown as { concept_id: string }[]
  ).map((r) => ({ conceptId: r.concept_id }));
  const aisles = Object.keys(list.byAisle);

  const weekEnd = new Date(data.weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const weekLabel = `${new Date(data.weekStart).toLocaleDateString("en-GB", opts)} to ${weekEnd.toLocaleDateString("en-GB", opts)}`;

  // Une liste de courses ne vaut que si les jours sont connus : on le dit avant l'achat.
  const planDates = (
    await rawDb()
      .prepare(
        `SELECT DISTINCT s.date FROM meal_slots s
         JOIN meal_plans p ON p.id = s.plan_id
         WHERE p.user_id = ? AND p.week_start = ?`,
      )
      .all((await currentUserId()), data.weekStart) as unknown as { date: string }[]
  ).map((r) => r.date);
  const decided = new Set(
    (
      await rawDb()
        .prepare("SELECT date FROM day_overrides WHERE user_id = ?")
        .all((await currentUserId())) as unknown as { date: string }[]
    ).map((r) => r.date),
  );
  const undecided = planDates.filter((d) => !decided.has(d));

  return (
    <Page>
      <Band
        title={lang === "fr" ? "Courses de la semaine" : "Shopping for the week"}
        note={`${weekLabel} · ${list.lines.length} ${lang === "fr" ? "à acheter" : "to buy"} · ${list.pantryCheck.length} ${lang === "fr" ? "à vérifier" : "to check"}`}
        color="var(--feuille)"
      />

      <Journey steps={steps} lang={lang} />

      {undecided.length > 0 ? (
        <Link
          href="/week"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-[7px] p-3 no-underline transition-transform duration-200 hover:-translate-y-0.5"
          style={{ background: "var(--curcuma)", color: "#fff" }}
        >
          <span className="text-[14px] font-bold">
            {undecided.length} day{undecided.length > 1 ? "s" : ""} still undecided
          </span>
          <span className="text-[13px] opacity-90">
            Set where you are on each day and this list gets exact. Meals that have to travel need different food.
          </span>
          <span className="ml-auto text-[13px] font-bold underline underline-offset-4">Open the week</span>
        </Link>
      ) : null}

      <div className="mb-3 flex justify-end">
        <ShoppingDone />
      </div>

      <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px]" style={{ color: "var(--soft)" }}>
        <span>
          <b className="tabnum" style={{ color: "var(--ink)" }}>
            {list.estimatedCents === null ? "—" : `${(list.estimatedCents / 100).toFixed(0)} €`}
          </b>{" "}
          {lang === "fr" ? "cette semaine" : "this week"}
        </span>
        {list.totalOrphanG > 0 ? (
          <span>
            <b className="tabnum" style={{ color: "var(--curcuma)" }}>{formatGrams(list.totalOrphanG)}</b>{" "}
            {lang === "fr" ? "risquent d'être perdus" : "at risk of waste"}
          </span>
        ) : null}
        {list.covered.length > 0 ? (
          <span>
            <b className="tabnum" style={{ color: "var(--ink)" }}>{list.covered.length}</b>{" "}
            {lang === "fr" ? "déjà en stock" : "already in stock"}
          </span>
        ) : null}
      </p>

      <div className="flex flex-col gap-4">
        {list.pantryCheck.length ? (
          <section>
            <div className="etal-band mb-2" style={{ "--c": "var(--soft)" } as React.CSSProperties}>
              <h2 className="text-[16px] leading-none">
                {lang === "fr" ? "Déjà dans le placard ?" : "Already in the cupboard?"}
              </h2>
              <span className="text-[12px] font-semibold opacity-75">
                {lang === "fr"
                  ? `${list.pantryCheck.length} produits qui durent des semaines · ✓ je l'ai, + à acheter`
                  : `${list.pantryCheck.length} items that last weeks · ✓ got it, + add to the list`}
                {list.pantryRestockCents !== null
                  ? ` · ${(list.pantryRestockCents / 100).toFixed(0)} €`
                  : ""}
              </span>
            </div>
            <div className="etal-card flex flex-wrap gap-2 p-3">
              {list.pantryCheck.map((line) => (
                <CupboardChip
                  key={line.conceptId}
                  conceptId={line.conceptId}
                  name={names[line.conceptId] ?? line.conceptId}
                  grams={formatGrams(line.neededG)}
                  state="unknown"
                  lang={lang}
                  onPack={SHELF_TIPS[line.conceptId]?.onPack}
                  where={SHELF_TIPS[line.conceptId]?.where}
                />
              ))}
              {declaredHave.map((d) => (
                <CupboardChip
                  key={d.conceptId}
                  conceptId={d.conceptId}
                  name={names[d.conceptId] ?? d.conceptId}
                  grams=""
                  state="have"
                  lang={lang}
                />
              ))}
            </div>
          </section>
        ) : null}

        {STOPS.map((stop) => {
          const stopAisles = aisles.filter((a) => (stop.aisles as readonly string[]).includes(a));
          const count = stopAisles.reduce((n, a) => n + (list.byAisle[a]?.length ?? 0), 0);
          if (count === 0) return null;
          return (
        <div key={stop.id} className="flex flex-col gap-3">
          <div className="etal-band" style={{ "--c": stop.color } as React.CSSProperties}>
            <h2 className="text-[17px] leading-none">{lang === "fr" ? stop.labelFr : stop.label}</h2>
            <span className="text-[12px] font-semibold opacity-75">
              {count} {lang === "fr" ? "à prendre" : "to pick up"} · {lang === "fr" ? stop.noteFr : stop.note}
            </span>
          </div>
        {stopAisles.map((aisle) => (
          <section key={aisle}>
            <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wider" style={{ color: "var(--soft)" }}>
              {AISLE_LABEL[aisle] ?? aisle}
            </h3>
            <div className="flex flex-col gap-1.5">
              {(list.byAisle[aisle] ?? []).map((line) => (
                <FoodMenu
                  key={line.conceptId}
                  conceptId={line.conceptId}
                  name={names[line.conceptId] ?? line.conceptId}
                  haveG={line.boughtG}
                >
                <div className="etal-card flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold">{names[line.conceptId] ?? line.conceptId}</div>
                    {line.hint || line.keepDays >= 21 || line.freezeG > 0 ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {line.hint ? (
                          <span className="text-[13px] font-semibold" style={{ color: "var(--feuille)" }}>
                            {line.hint}
                          </span>
                        ) : null}
                        {line.keepDays >= 21 ? <Keeps days={line.keepDays} lang={lang} /> : null}
                        {line.freezeG > 0 ? (
                          <Freeze grams={line.freezeG} until={line.lastUseDate} lang={lang} />
                        ) : null}
                      </div>
                    ) : null}
                    {SHELF_TIPS[line.conceptId] ? (
                      <ShelfTip tip={SHELF_TIPS[line.conceptId]!} lang={lang} />
                    ) : null}
                    <div className="mt-0.5 text-[12px]" style={{ color: "var(--soft)" }}>
                      {lang === "fr" ? "il en faut" : "need"} {formatGrams(line.neededG)}
                      {line.fromPantryG > 0
                        ? ` · ${formatGrams(line.fromPantryG)} ${lang === "fr" ? "déjà en stock" : "already in stock"}`
                        : ""}
                      {line.usedIn.length > 1
                        ? ` · ${lang === "fr" ? `dans ${line.usedIn.length} repas` : `used in ${line.usedIn.length} meals`}`
                        : ""}
                    </div>
                    {line.orphaned ? (
                      <div className="mt-1 text-[12px] font-semibold" style={{ color: "var(--curcuma)" }}>
                        {formatGrams(line.leftoverG)} left over, {line.openDays} days once open
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="display tabnum text-[18px] leading-none">{formatPackages(line)}</div>
                    <PriceTag
                      conceptId={line.conceptId}
                      name={names[line.conceptId] ?? line.conceptId}
                      cents={line.centsPerKg}
                      source={line.priceSource}
                      boughtG={line.staple ? line.neededG : line.boughtG}
                    />
                  </div>
                </div>
                </FoodMenu>
              ))}
            </div>
          </section>
        ))}
        </div>
          );
        })}
      </div>
    </Page>
  );
}

/**
 * Un poulet acheté mardi pour un repas de vendredi ne tient pas au frigo.
 * On dit lequel, combien, et jusqu'à quand.
 */
function Freeze({ grams, until, lang }: { grams: number; until: string | null; lang: "en" | "fr" }) {
  const day = until
    ? new Date(until).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { weekday: "long" })
    : null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: "var(--myrtille)", color: "var(--on-color)" }}
    >
      <Snowflake />
      {lang === "fr"
        ? `congeler ${formatGrams(grams)}${day ? ` jusqu'à ${day}` : ""}`
        : `freeze ${formatGrams(grams)}${day ? ` until ${day}` : ""}`}
    </span>
  );
}

function Snowflake() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <path d="M12 2v20M4 6l16 12M20 6L4 18" />
    </svg>
  );
}

/** Ce qui tient des semaines n'est pas une dépense de la semaine : on le voit d'un coup d'oeil. */
function Keeps({ days, lang }: { days: number; lang: "en" | "fr" }) {
  const label =
    lang === "fr"
      ? days >= 300
        ? "tient un an"
        : days >= 120
          ? "tient des mois"
          : `tient ${Math.round(days / 7)} semaines`
      : days >= 300
        ? "keeps a year"
        : days >= 120
          ? "keeps months"
          : `keeps ${Math.round(days / 7)} weeks`;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: "var(--aubergine)", color: "var(--on-color)" }}
    >
      {label}
    </span>
  );
}
