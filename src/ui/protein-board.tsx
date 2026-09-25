/**
 * La section protéines a droit à un vrai traitement : c'est le chiffre qui
 * décide de sa prise de masse. On classe au poids servi, on colore par famille
 * (viande, poisson, oeuf, laitier, végétal) et on met le premier en avant.
 */

export interface ProteinRow {
  id: string;
  label: string;
  kg: number;
  family: Family;
}

export type Family = "meat" | "fish" | "egg" | "dairy" | "plant";

const FAMILY: Record<Family, { color: string; label: string; labelFr: string }> = {
  meat: { color: "#d63127", label: "meat", labelFr: "viande" },
  fish: { color: "#2440c8", label: "fish", labelFr: "poisson" },
  egg: { color: "#c07a06", label: "eggs", labelFr: "oeufs" },
  dairy: { color: "#ab1565", label: "dairy", labelFr: "laitier" },
  plant: { color: "#137a42", label: "plants", labelFr: "végétal" },
};

export function ProteinBoard({ rows, lang }: { rows: ProteinRow[]; lang: "en" | "fr" }) {
  if (rows.length === 0) {
    return (
      <p className="text-[14px]" style={{ color: "var(--soft)" }}>
        {lang === "fr" ? "Rien de cuisiné pour l'instant." : "Nothing cooked yet."}
      </p>
    );
  }

  const total = rows.reduce((s, r) => s + r.kg, 0) || 1;
  const [hero, ...rest] = rows;
  const byFamily = new Map<Family, number>();
  for (const r of rows) byFamily.set(r.family, (byFamily.get(r.family) ?? 0) + r.kg);
  const families = [...byFamily.entries()].sort((a, b) => b[1] - a[1]);
  const animal = (byFamily.get("meat") ?? 0) + (byFamily.get("fish") ?? 0) + (byFamily.get("egg") ?? 0);
  const animalPct = Math.round((animal / total) * 100);

  return (
    <div className="flex flex-col gap-4">
      {/* Ruban : d'où vient la protéine, en une seule barre */}
      <div>
        <div className="flex h-3 overflow-hidden rounded-full" style={{ gap: 2 }}>
          {families.map(([family, kg]) => (
            <div
              key={family}
              style={{
                width: `${(kg / total) * 100}%`,
                background: FAMILY[family].color,
                borderRadius: 999,
              }}
              title={`${FAMILY[family].label} ${Math.round((kg / total) * 100)} %`}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {families.map(([family, kg]) => (
            <span key={family} className="flex items-center gap-1.5 text-[12px] font-semibold">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: FAMILY[family].color }}
                aria-hidden
              />
              <span>{lang === "fr" ? FAMILY[family].labelFr : FAMILY[family].label}</span>
              <span className="tabnum" style={{ color: "var(--soft)" }}>
                {Math.round((kg / total) * 100)} %
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Le premier, en grand */}
      {hero ? (
        <div
          className="relative overflow-hidden rounded-[7px] px-4 py-3"
          style={{ background: FAMILY[hero.family].color, color: "var(--on-color)" }}
        >
          <Fork />
          <div className="relative">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
              {lang === "fr" ? "ta protéine numéro un" : "your number one protein"}
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="display text-[34px] leading-none">{hero.label}</span>
              <span className="display tabnum text-[26px] leading-none opacity-90">{hero.kg} kg</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Le reste, barres fines colorées par famille */}
      <div className="flex flex-col gap-1.5">
        {rest.map((r) => (
          <div key={r.id} className="flex items-center gap-3">
            <span className="w-[128px] shrink-0 truncate text-[13.5px] font-bold">{r.label}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface2)" }}>
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(4, (r.kg / (hero?.kg || 1)) * 100)}%`, background: FAMILY[r.family].color }}
              />
            </span>
            <span className="tabnum w-[52px] shrink-0 text-right text-[13px] font-bold">{r.kg} kg</span>
          </div>
        ))}
      </div>

      <p className="text-[12px]" style={{ color: "var(--soft)" }}>
        {lang === "fr"
          ? `${animalPct} % de tes protéines viennent d'un animal. Total servi : ${Math.round(total)} kg.`
          : `${animalPct} % of your protein comes from an animal. ${Math.round(total)} kg served in total.`}
      </p>
    </div>
  );
}

/** Une fourchette en filigrane : la seule décoration, et elle dit le sujet. */
function Fork() {
  return (
    <svg
      className="pointer-events-none absolute -right-4 -top-6 h-[130px] w-[130px]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.9"
      strokeLinecap="round"
      style={{ opacity: 0.22 }}
      aria-hidden
    >
      <path d="M7 2v7a3 3 0 0 0 6 0V2M10 2v7M10 12v10" />
      <path d="M18 2c-1.6 1.6-2 3.4-2 5.5 0 1.6.7 2.6 2 3V22" />
    </svg>
  );
}
