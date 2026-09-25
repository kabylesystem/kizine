import Link from "next/link";
import type { Step } from "@/server/journey";

/**
 * Le fil de la semaine, en une ligne discrète : quatre pastilles numérotées,
 * la courante en couleur, les faites cochées. C'est un repère, pas un panneau.
 */
export function Journey({ steps, lang }: { steps: Step[]; lang: "en" | "fr" }) {
  return (
    <nav className="mb-5" aria-label={lang === "fr" ? "Étapes de la semaine" : "Steps of the week"}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {steps.map((s, i) => {
          const state = s.done ? "done" : s.current ? "now" : "later";
          return (
            <li key={s.id} className="flex items-center gap-1">
              <Link
                href={s.href}
                prefetch
                title={lang === "fr" ? s.detailFr : s.detail}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 no-underline transition-colors"
                style={{
                  background: state === "now" ? "var(--curcuma)" : "transparent",
                  color: state === "now" ? "var(--on-color)" : state === "done" ? "var(--ink)" : "var(--soft)",
                }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold"
                  style={{
                    background: state === "done" ? "var(--feuille)" : state === "now" ? "rgba(0,0,0,0.2)" : "var(--surface2)",
                    color: state === "later" ? "var(--soft)" : "var(--on-color)",
                  }}
                  aria-hidden
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <span className="text-[13px] font-bold">{lang === "fr" ? s.labelFr : s.label}</span>
                {state === "now" ? (
                  <span className="hidden text-[12px] opacity-85 sm:inline">· {lang === "fr" ? s.detailFr : s.detail}</span>
                ) : null}
              </Link>
              {i < steps.length - 1 ? (
                <span className="text-[13px]" style={{ color: "var(--line)" }} aria-hidden>
                  →
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
