export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1100px] px-4 py-5 lg:px-8 lg:py-8">{children}</div>;
}

export function Band({ title, note, color }: { title: string; note?: string; color: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span className="h-[26px] w-[5px] shrink-0 self-center rounded-full" style={{ background: color }} aria-hidden />
      <h1 className="display text-[26px] leading-none sm:text-[30px]">{title}</h1>
      {note ? (
        <span className="text-[13px] font-semibold" style={{ color: "var(--soft)" }}>
          {note}
        </span>
      ) : null}
    </div>
  );
}

export function Meter({
  value,
  target,
  color,
  label,
  unit,
  estimated = 0,
  expected = 0,
}: {
  value: number;
  target: number;
  color: string;
  label: string;
  unit: string;
  /** Part de la valeur qui vient d'entrées estimées : dessinée plus claire. */
  estimated?: number;
  /** Ce qui est encore prévu et pas mangé : dessiné en creux. */
  expected?: number;
}) {
  const pct = (v: number) => (target > 0 ? Math.min(100, (v / target) * 100) : 0);
  const exact = Math.max(0, value - estimated);
  const over = target > 0 && value / target > 1.04;
  return (
    <div className="etal-card p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-bold" style={{ color: "var(--soft)" }}>
          {label}
        </span>
        <span className="tabnum text-[13px] font-bold" style={{ color: over ? "var(--curcuma)" : "var(--soft)" }}>
          {estimated > 0 ? "≈ " : ""}
          {Math.round(value)} / {Math.round(target)} {unit}
        </span>
      </div>
      <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface2)" }}>
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${pct(value + expected)}%`, background: color, opacity: 0.22 }} />
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${pct(value)}%`, background: color, opacity: 0.55 }} />
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${pct(exact)}%`, background: color }} />
      </div>
    </div>
  );
}

export const SLOT_COLOR: Record<string, string> = {
  breakfast: "var(--curcuma)",
  lunch: "var(--myrtille)",
  snack: "var(--betterave)",
  dinner: "var(--argile)",
};

/** Versions opaques, pour tout ce qui porte du texte blanc quel que soit le thème. */
export const SLOT_SOLID: Record<string, string> = {
  breakfast: "#c07a06",
  lunch: "#2440c8",
  snack: "#ab1565",
  dinner: "#b0562f",
};

export const SLOT_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
};
