"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AddEntry, type PortionOption } from "./add-entry";

const REASONS = [
  { id: "not hungry", en: "Not hungry", fr: "Pas faim" },
  { id: "no time", en: "No time", fr: "Pas eu le temps" },
  { id: "ate out", en: "Ate out", fr: "Mangé dehors" },
  { id: "did not fancy it", en: "Did not fancy it", fr: "Pas envie" },
  { id: "it went wrong", en: "It went wrong", fr: "Je l'ai raté" },
];

/**
 * Le menu d'un repas, au clic droit, à l'appui long ou sur « ⋯ ». Tout ce que
 * la vie fait à un repas prévu tient ici : mangé tel quel, mangé autre chose
 * (une portion, un produit, une louche), remplacé, ou pas mangé. Chaque
 * réponse nourrit le même bilan du jour, avec sa confiance.
 */
export function MealMenu({
  slotId,
  title,
  state,
  lang,
  free = false,
  date,
  slotKcal,
  portions = [],
  withButton = false,
  children,
}: {
  slotId: string;
  title: string;
  state: string | null;
  lang: "en" | "fr";
  /** Portion d'un plat libre : on la mange, on ne la cuisine pas. */
  free?: boolean;
  date?: string;
  slotKcal?: number;
  portions?: PortionOption[];
  /** Un petit « ⋯ » visible à droite : sur mobile, l'appui long ne se devine pas. */
  withButton?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pendingState, setPendingState] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const timer = useRef<number | null>(null);
  const fr = lang === "fr";

  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    // Le clic qui ouvre le menu remonte encore jusqu'à window : on n'écoute qu'au tour suivant.
    const id = window.setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("scroll", close, true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [at]);

  async function send(action: "skip" | "replace" | "undo" | "ate", reason?: string) {
    setBusy(true);
    if (action === "replace") {
      setAt(null);
      setNote(fr ? "Je cherche autre chose…" : "Finding something else…");
    }
    const res = await fetch("/api/meal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, action, reason }),
    });
    const data = (await res.json().catch(() => ({}))) as { title?: string; fromStock?: boolean };
    if (action === "skip") setPendingState("skipped");
    if (action === "ate") setPendingState("cooked");
    if (action === "undo") setPendingState("planned");
    if (action === "replace" && data.title) {
      setNote(
        data.fromStock
          ? fr
            ? `${data.title} · avec ce que tu as déjà`
            : `${data.title} · from what you already have`
          : fr
            ? `${data.title} · demande un achat en plus`
            : `${data.title} · needs one more thing`,
      );
      setTimeout(() => setNote(null), 4000);
    }
    setAt(null);
    setBusy(false);
    router.refresh();
  }

  async function eatFree() {
    setBusy(true);
    await fetch("/api/free/eat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotId }) });
    setPendingState("cooked");
    setAt(null);
    setBusy(false);
    router.refresh();
  }

  const shown = pendingState ?? state;
  const item = "block w-full px-3 py-2.5 text-left text-[13.5px] font-bold transition-colors hover:bg-[var(--surface2)]";
  const sub = "mt-0.5 block text-[11.5px] font-normal";

  return (
    <>
      <div className="flex items-center gap-1">
        <div
          className="min-w-0 flex-1"
          onContextMenu={(e) => {
            e.preventDefault();
            setAt({ x: e.clientX, y: e.clientY });
          }}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") return;
            const { clientX: x, clientY: y } = e;
            timer.current = window.setTimeout(() => setAt({ x, y }), 500);
          }}
          onPointerUp={() => timer.current && window.clearTimeout(timer.current)}
          onPointerCancel={() => timer.current && window.clearTimeout(timer.current)}
          style={{
            opacity: shown === "skipped" ? 0.4 : 1,
            textDecoration: shown === "skipped" ? "line-through" : "none",
            transition: "opacity 150ms",
          }}
        >
          {children}
        </div>
        {withButton ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setAt({ x: r.left, y: r.bottom + 4 });
            }}
            aria-label={fr ? "Autres choix" : "More options"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[16px] font-bold transition-colors hover:bg-[var(--surface2)]"
            style={{ color: "var(--soft)" }}
          >
            ⋯
          </button>
        ) : null}
      </div>

      {logging && date ? (
        <div className="mt-1">
          <AddEntry date={date} slotId={slotId} slotKcal={slotKcal} portions={portions} lang={lang} startOpen onClose={() => setLogging(false)} />
        </div>
      ) : null}

      {note ? (
        <div
          className="fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-[13px] font-bold sm:bottom-4"
          style={{ background: busy ? "var(--curcuma)" : "var(--feuille)", color: "var(--on-color)" }}
        >
          {note}
        </div>
      ) : null}

      {at ? (
        <div
          className="fixed z-50 w-[248px] overflow-hidden rounded-[7px]"
          style={{
            left: Math.min(at.x, (typeof window !== "undefined" ? window.innerWidth : 800) - 260),
            top: Math.min(at.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 340),
            background: "var(--surface)",
            boxShadow: "0 18px 40px -18px rgb(8 10 7 / 0.7)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="truncate px-3 py-2 text-[12px] font-bold" style={{ background: "var(--surface2)" }}>
            {title}
          </div>

          {shown === "cooked" ? (
            <button disabled={busy} onClick={() => void send("undo")} className={item} style={{ color: "var(--curcuma)" }}>
              {fr ? "Finalement je ne l'ai pas mangé" : "Actually I did not eat it"}
            </button>
          ) : shown === "skipped" ? (
            <button disabled={busy} onClick={() => void send("ate")} className={item} style={{ color: "var(--feuille)" }}>
              {fr ? "Finalement je l'ai mangé" : "Actually I ate it"}
            </button>
          ) : (
            <>
              <button disabled={busy} onClick={() => (free ? void eatFree() : void send("ate"))} className={item} style={{ color: "var(--feuille)" }}>
                {free ? (fr ? "Je l'ai mangé" : "I ate it") : fr ? "Mangé tel que prévu" : "Ate it as planned"}
                <span className={sub} style={{ color: "var(--soft)" }}>
                  {fr ? "compté ≈, sans peser" : "counted ≈, no weighing"}
                </span>
              </button>
              {date ? (
                <button
                  disabled={busy}
                  onClick={() => {
                    setAt(null);
                    setLogging(true);
                  }}
                  className={item}
                  style={{ color: "var(--argile)" }}
                >
                  {fr ? "J'ai mangé autre chose" : "I ate something else"}
                  <span className={sub} style={{ color: "var(--soft)" }}>
                    {fr ? "une portion, un produit, ou à la louche" : "a batch portion, a product, or a ballpark"}
                  </span>
                </button>
              ) : null}
              <button disabled={busy} onClick={() => void send("replace")} className={item} style={{ color: "var(--myrtille)" }}>
                {fr ? "Propose-moi autre chose" : "Give me something else"}
                <span className={sub} style={{ color: "var(--soft)" }}>
                  {fr ? "pris dans ce que tu as déjà acheté" : "picked from what you already bought"}
                </span>
              </button>
              <div className="h-px" style={{ background: "var(--line)" }} />
              <div className="px-3 pt-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--soft)" }}>
                {fr ? "Je ne l'ai pas mangé" : "I did not eat it"}
              </div>
              {REASONS.map((r) => (
                <button
                  key={r.id}
                  disabled={busy}
                  onClick={() => void send("skip", r.id)}
                  className="block w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--surface2)]"
                >
                  {fr ? r.fr : r.en}
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
