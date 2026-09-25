"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_COLOR, CATEGORY_LABEL, CATEGORY_SOLID, VERDICT_META, type DeckCard, type Verdict } from "./types";
import { PORK_CONCEPT_IDS } from "@/data/pork";

interface Props {
  cards: DeckCard[];
  onDone: (verdicts: Record<string, Verdict>) => void;
}

const ORDER: Verdict[] = ["love", "like", "meh", "never"];

function vibrate(ms: number): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
}

const DECK_KEY = "semoule:deck";
const DECK_LEGACY = "etal:deck";

/** Lit la nouvelle clé, sinon reprend l'ancienne : renommer l'app ne doit rien effacer. */
function readKey(key: string, legacy: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fresh = window.localStorage.getItem(key);
    if (fresh) return fresh;
    const old = window.localStorage.getItem(legacy);
    if (old) {
      window.localStorage.setItem(key, old);
      window.localStorage.removeItem(legacy);
      return old;
    }
  } catch {
    return null;
  }
  return null;
}


function readDeck(): { index: number; verdicts: Record<string, Verdict> } | null {
  try {
    const raw = readKey(DECK_KEY, DECK_LEGACY);
    return raw ? (JSON.parse(raw) as { index: number; verdicts: Record<string, Verdict> }) : null;
  } catch {
    return null;
  }
}

export function SwipeDeck({ cards, onDone }: Props) {
  const [index, setIndex] = useState(0);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [restored, setRestored] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [flying, setFlying] = useState<{ verdict: Verdict; x: number; y: number } | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const current = cards[index];
  const next = cards[index + 1];
  const nextNext = cards[index + 2];

  const intent = useMemo<Verdict | null>(() => {
    if (!drag.active && !flying) return null;
    const { x, y } = flying ?? drag;
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (Math.max(ax, ay) < 55) return null;
    if (ay > ax) return y < 0 ? "love" : "never";
    return x > 0 ? "like" : "meh";
  }, [drag, flying]);

  const commit = useCallback(
    (verdict: Verdict) => {
      const card = cards[index];
      if (!card) return;
      const meta = { love: { x: 0, y: -700 }, never: { x: 0, y: 700 }, like: { x: 700, y: -60 }, meh: { x: -700, y: -60 } };
      setFlying({ verdict, ...meta[verdict] });
      vibrate(verdict === "never" ? 24 : 12);
      setVerdicts((v) => ({ ...v, [card.id]: verdict }));
      window.setTimeout(() => {
        setFlying(null);
        setDrag({ x: 0, y: 0, active: false });
        setIndex((i) => i + 1);
      }, 190);
    },
    [cards, index],
  );

  const undo = useCallback(() => {
    if (index === 0) return;
    const prev = cards[index - 1];
    if (!prev) return;
    setVerdicts((v) => {
      const copy = { ...v };
      delete copy[prev.id];
      return copy;
    });
    setIndex((i) => i - 1);
  }, [cards, index]);

  useEffect(() => {
    const saved = readDeck();
    if (saved && Object.keys(saved.verdicts).length > 0) {
      // On reprend à la première carte sans verdict, pas à l'index sauvegardé :
      // le paquet peut avoir changé entre-temps (une carte porc au lieu de quatre).
      const firstOpen = cards.findIndex((c) => !(c.id in saved.verdicts));
      const resume = firstOpen === -1 ? cards.length : firstOpen;
      setIndex(resume);
      setVerdicts(saved.verdicts);
      if (resume >= cards.length) setReviewing(true);
    }
    setRestored(true);
  }, [cards]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(DECK_KEY, JSON.stringify({ index, verdicts }));
    } catch {
      /* mode privé : on continue sans sauvegarde */
    }
  }, [index, verdicts, restored]);

  useEffect(() => {
    if (!restored || reviewing) return;
    if (index >= cards.length && cards.length > 0) onDone(verdicts);
  }, [index, cards.length, onDone, verdicts, restored, reviewing]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (flying) return;
      const found = ORDER.find((v) => VERDICT_META[v].key === e.key);
      if (found) {
        e.preventDefault();
        commit(found);
        return;
      }
      if (e.key === "Backspace" || (e.key === "z" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        undo();
      }
      const digit = ORDER[Number(e.key) - 1];
      if (digit) {
        e.preventDefault();
        commit(digit);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commit, undo, flying]);

  if (reviewing) {
    const counts = { love: 0, like: 0, meh: 0, never: 0 } as Record<Verdict, number>;
    for (const v of Object.values(verdicts)) counts[v]++;
    return (
      <div className="flex w-full max-w-[520px] flex-col gap-3">
        <div className="etal-card p-4">
          <h3 className="mb-2 text-[18px] font-bold">Already sorted</h3>
          <div className="grid grid-cols-4 gap-2">
            {ORDER.map((v) => (
              <div key={v} className="rounded-md p-2 text-center" style={{ background: VERDICT_META[v].solid, color: "#fff" }}>
                <div className="display tabnum text-[24px] leading-none">{counts[v]}</div>
                <div className="mt-0.5 text-[11px] font-semibold opacity-90">{VERDICT_META[v].label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="etal-btn etal-btn--color flex-1" style={{ "--c": "#d63127" } as React.CSSProperties} onClick={() => onDone(verdicts)}>
            Keep these
          </button>
          <button
            className="etal-btn etal-btn--quiet"
            onClick={() => {
              setIndex(0);
              setVerdicts({});
              setReviewing(false);
            }}
          >
            Sort again
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const pointerDown = (e: React.PointerEvent) => {
    if (flying) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, active: true });
    cardRef.current?.setPointerCapture(e.pointerId);
  };
  const pointerMove = (e: React.PointerEvent) => {
    if (!drag.active || flying) return;
    setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y, active: true });
  };
  const pointerUp = () => {
    if (!drag.active) return;
    if (intent) commit(intent);
    else setDrag({ x: 0, y: 0, active: false });
  };

  const pos = flying ?? drag;
  const rotate = pos.x / 22;
  const progress = index / cards.length;

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="w-full max-w-[420px]">
        <div className="mb-2 flex items-baseline justify-between text-[13px] font-semibold" style={{ color: "var(--soft)" }}>
          <span>
            {index + 1} / {cards.length}
          </span>
          <span style={{ color: CATEGORY_COLOR[current.category] }}>{CATEGORY_LABEL[current.category] ?? current.category}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface2)" }}>
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${progress * 100}%`, background: CATEGORY_COLOR[current.category] ?? "var(--tomate)" }}
          />
        </div>
      </div>

      <div className="relative h-[440px] w-full max-w-[420px] no-select" style={{ perspective: "1200px" }}>
        {nextNext && <CardFace card={nextNext} depth={2} />}
        {next && <CardFace card={next} depth={1} />}
        <div
          ref={cardRef}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
          style={{
            zIndex: 20,
            transform: `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${rotate}deg)`,
            transition: drag.active ? "none" : "transform 190ms cubic-bezier(.2,.8,.3,1)",
          }}
        >
          <CardFace card={current} depth={0} intent={intent} />
        </div>
      </div>

      <div className="flex w-full max-w-[420px] items-center gap-2">
        {ORDER.map((v) => (
          <button
            key={v}
            onClick={() => commit(v)}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-md py-3 font-bold transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: intent === v ? VERDICT_META[v].solid : "var(--surface)",
              color: intent === v ? "#fff" : "var(--ink)",
            }}
          >
            <span className="text-[14px]">{VERDICT_META[v].label}</span>
            <span className="text-[10px] font-semibold opacity-60">{v === "love" ? "↑" : v === "never" ? "↓" : v === "like" ? "→" : "←"}</span>
          </button>
        ))}
      </div>

      <button
        onClick={undo}
        disabled={index === 0}
        className="text-[13px] font-semibold underline-offset-4 transition-opacity hover:underline disabled:opacity-30"
        style={{ color: "var(--soft)" }}
      >
        Undo last card
      </button>
    </div>
  );
}

/** Aliments de porc : le tampon les signale, sans jamais empêcher de choisir. */
const PORK = new Set<string>(PORK_CONCEPT_IDS);

function CardFace({ card, depth, intent }: { card: DeckCard; depth: number; intent?: Verdict | null }) {
  const solid = CATEGORY_SOLID[card.category] ?? "#d63127";
  const [broken, setBroken] = useState(false);
  // Le navigateur garde la photo précédente à l'écran tant que la nouvelle n'est
  // pas décodée : la carte affichait donc l'aliment d'avant. On attend le
  // chargement, carte par carte, pour ne jamais montrer la mauvaise image.
  const [loaded, setLoaded] = useState(false);
  const hasPhoto = Boolean(card.image) && !broken;

  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[10px]"
      style={{
        background: solid,
        transform: `translateY(${depth * 14}px) scale(${1 - depth * 0.05})`,
        opacity: depth === 0 ? 1 : depth === 1 ? 0.7 : 0.4,
        filter: depth === 0 ? "none" : "brightness(0.8)",
        boxShadow: depth === 0 ? "0 24px 50px -28px rgb(20 22 15 / 0.55)" : "none",
        zIndex: 10 - depth,
      }}
    >
      {hasPhoto ? (
        <img
          key={card.image ?? card.id}
          src={card.image ?? ""}
          alt=""
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-150"
          style={{ filter: "saturate(1.06)", opacity: loaded ? 1 : 0 }}
        />
      ) : null}

      {/* Voile sombre fixe : le titre reste lisible sur n'importe quelle photo. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[62%]"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,10,7,0) 0%, rgba(8,10,7,0.55) 45%, rgba(8,10,7,0.88) 78%, rgba(8,10,7,0.96) 100%)",
        }}
      />

      <span
        className="absolute left-4 top-4 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
        style={{ background: solid, color: "#fff", boxShadow: "0 2px 10px rgb(8 10 7 / 0.45)" }}
      >
        {CATEGORY_LABEL[card.category] ?? card.category}
      </span>

      {/* Un tampon, pas un verdict : elle reste libre de le mettre où elle veut. */}
      {PORK.has(card.id) ? (
        <span
          className="absolute right-3 top-5 flex select-none flex-col items-center rounded-[10px] px-3 py-1.5"
          style={{
            transform: "rotate(11deg)",
            color: "#ff6b6b",
            border: "3px solid #ff6b6b",
            background: "rgba(8,10,7,0.32)",
            boxShadow: "0 2px 14px rgb(8 10 7 / 0.5)",
          }}
          aria-hidden
        >
          <span className="text-[19px] font-black uppercase leading-none tracking-[0.14em]">haram</span>
          <span className="mt-0.5 text-[8.5px] font-bold uppercase tracking-[0.18em] opacity-90">
            your call though
          </span>
        </span>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 p-5">
        <div className="display text-[38px] leading-[0.95]" style={{ color: "#fff" }}>
          {card.nameEn}
        </div>
        <div className="mt-1.5 text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.82)" }}>
          {card.nameFr}
        </div>
      </div>

      {intent ? (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: `${VERDICT_META[intent].solid}f0` }}
        >
          <span className="display text-[46px]" style={{ color: "#fff" }}>
            {VERDICT_META[intent].label}
          </span>
        </div>
      ) : null}
    </div>
  );
}
