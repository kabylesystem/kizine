"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface MoveTarget {
  slotId: string;
  date: string;
  title: string;
}

/**
 * Déplacer un plat sur un autre jour. C'est un échange, pas un déplacement :
 * le plat qui occupait la place vient prendre la sienne, donc la semaine garde
 * le même ensemble de plats et la liste de courses reste vraie.
 */
export function MoveMeal({
  slotId,
  targets,
  lang,
}: {
  slotId: string;
  targets: MoveTarget[];
  lang: "en" | "fr";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  async function move(targetSlotId: string) {
    setBusy(true);
    await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, targetSlotId }),
    });
    setOpen(false);
    router.refresh();
    setBusy(false);
  }

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { weekday: "short" });

  return (
    <div ref={box} className="relative">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={lang === "fr" ? "changer de jour" : "move to another day"}
        aria-label={lang === "fr" ? "changer de jour" : "move to another day"}
        className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
        style={{ background: open ? "var(--myrtille)" : "var(--surface2)", color: open ? "#fff" : "var(--soft)" }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6l-4 4 4 4M4 10h13M16 18l4-4-4-4M20 14H7" />
        </svg>
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[230px] overflow-hidden rounded-[7px]"
          style={{ background: "var(--surface)", boxShadow: "0 18px 40px -18px rgb(8 10 7 / 0.7)" }}
        >
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider" style={{ background: "var(--surface2)", color: "var(--soft)" }}>
            {lang === "fr" ? "échanger avec" : "swap with"}
          </div>
          {targets.length === 0 ? (
            <p className="px-3 py-2.5 text-[13px]" style={{ color: "var(--soft)" }}>
              {lang === "fr" ? "aucun autre jour possible" : "no other day fits"}
            </p>
          ) : (
            targets.map((t) => (
              <button
                key={t.slotId}
                disabled={busy}
                onClick={() => void move(t.slotId)}
                className="block w-full px-3 py-2 text-left transition-colors hover:bg-[var(--surface2)]"
              >
                <span className="block text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--soft)" }}>
                  {day(t.date)}
                </span>
                <span className="block truncate text-[13px] font-semibold">{t.title}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
