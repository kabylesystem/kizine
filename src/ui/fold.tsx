"use client";

import { useState } from "react";

/**
 * Une section qu'on ouvre quand on en a besoin. Les graphiques sont fermés par
 * défaut : Numbers sert d'abord à régler la cible, pas à contempler des courbes.
 */
export function Fold({
  title,
  note,
  children,
  open: initial = false,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="etal-card mb-3 p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold">{title}</span>
          {note ? (
            <span className="mt-0.5 block text-[13px]" style={{ color: "var(--soft)" }}>
              {note}
            </span>
          ) : null}
        </span>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform duration-200"
          style={{ background: "var(--surface2)", transform: open ? "rotate(180deg)" : "none" }}
          aria-hidden
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}
