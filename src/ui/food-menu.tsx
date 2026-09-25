"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Clic droit (ou appui long) sur un aliment : bannir, limiter, remettre à zéro.
 * « Never » devient une contrainte dure : aucune recette qui en contient ne sera proposée.
 */
export function FoodMenu({
  conceptId,
  name,
  children,
  /** Grammes à déclarer en stock quand il dit qu'il l'a déjà. */
  haveG,
}: {
  conceptId: string;
  name: string;
  children: React.ReactNode;
  haveG?: number;
}) {
  const router = useRouter();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [at]);

  async function declare(state: "have" | "need" | "unknown") {
    setBusy(true);
    await fetch("/api/cupboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conceptId, state, grams: haveG }),
    });
    setAt(null);
    setBusy(false);
    router.refresh();
  }

  async function send(action: "never" | "limit" | "reset", perWeek?: number) {
    setBusy(true);
    await fetch("/api/preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conceptId, action, perWeek }),
    });
    setAt(null);
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          setAt({ x: e.clientX, y: e.clientY });
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          const { clientX: x, clientY: y } = e;
          timer.current = window.setTimeout(() => setAt({ x, y }), 500);
        }}
        onPointerUp={() => {
          if (timer.current) window.clearTimeout(timer.current);
        }}
        onPointerCancel={() => {
          if (timer.current) window.clearTimeout(timer.current);
        }}
      >
        {children}
      </div>

      {at ? (
        <div
          className="fixed z-50 w-[212px] overflow-hidden rounded-[7px] shadow-lg"
          style={{
            left: Math.min(at.x, (typeof window !== "undefined" ? window.innerWidth : 800) - 224),
            top: Math.min(at.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 240),
            background: "var(--surface)",
            boxShadow: "0 18px 40px -18px rgb(8 10 7 / 0.7)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-[12px] font-bold" style={{ background: "var(--surface2)" }}>
            {name}
          </div>
          <button
            disabled={busy}
            onClick={() => void declare("have")}
            className="block w-full px-3 py-2.5 text-left text-[13.5px] font-bold transition-colors hover:bg-[var(--surface2)]"
            style={{ color: "var(--feuille)" }}
          >
            I already have it
          </button>
          <div className="h-px" style={{ background: "var(--line)" }} />
          <button
            disabled={busy}
            onClick={() => send("never")}
            className="block w-full px-3 py-2.5 text-left text-[13.5px] font-semibold transition-colors hover:bg-[var(--surface2)]"
            style={{ color: "var(--tomate)" }}
          >
            Never again
          </button>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              disabled={busy}
              onClick={() => send("limit", n)}
              className="block w-full px-3 py-2 text-left text-[13.5px] transition-colors hover:bg-[var(--surface2)]"
            >
              Max {n} time{n > 1 ? "s" : ""} a week
            </button>
          ))}
          <button
            disabled={busy}
            onClick={() => send("reset")}
            className="block w-full px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-[var(--surface2)]"
            style={{ color: "var(--soft)" }}
          >
            Clear my rule
          </button>
        </div>
      ) : null}
    </>
  );
}
