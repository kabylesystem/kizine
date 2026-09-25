import type { ShelfTip as Tip } from "@/data/shelf-tips";

/**
 * Ce qu'on cherche des yeux quand on est devant la gondole : le nom écrit sur
 * le paquet, le rayon, et le piège. « Fish sauce » ne se trouve pas en rayon,
 * « Nuoc-mâm, allée asiatique » si.
 */
export function ShelfTip({ tip, lang }: { tip: Tip; lang: "en" | "fr" }) {
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span
        className="rounded-[4px] px-1.5 py-0.5 text-[12px] font-bold"
        style={{ background: "var(--surface3)", color: "var(--ink)" }}
      >
        {tip.onPack}
      </span>
      <span className="text-[12px]" style={{ color: "var(--soft)" }}>
        {tip.where}
      </span>
      {tip.watch ? (
        <span className="text-[12px] font-semibold" style={{ color: "var(--curcuma)" }}>
          {lang === "fr" ? "attention : " : "watch out: "}
          {tip.watch}
        </span>
      ) : null}
    </div>
  );
}
