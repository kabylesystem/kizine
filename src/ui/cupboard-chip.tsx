"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type State = "unknown" | "have" | "need";

/**
 * En rayon, une seule question : je l'ai, ou pas.
 * Un tap répond, un deuxième change d'avis. « je ne l'ai pas » envoie la ligne
 * dans les courses, « je l'ai » la sort de la liste et la met en stock.
 */
export function CupboardChip({
  conceptId,
  name,
  grams,
  state,
  lang,
  onPack,
  where,
}: {
  conceptId: string;
  name: string;
  grams: string;
  state: State;
  lang: "en" | "fr";
  /** Nom écrit sur le paquet et rayon, quand le nom courant ne suffit pas. */
  onPack?: string;
  where?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(next: State) {
    setBusy(true);
    await fetch("/api/cupboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conceptId, state: next }),
    });
    router.refresh();
    setBusy(false);
  }

  const have = lang === "fr" ? "je l'ai" : "got it";
  const need = lang === "fr" ? "à acheter" : "need it";

  if (state === "have") {
    return (
      <Chip busy={busy} onClick={() => void set("unknown")} bg="var(--feuille)" fg="var(--on-color)">
        <span>✓ {name}</span>
        <span className="pl-1.5 opacity-80">{have}</span>
      </Chip>
    );
  }
  if (state === "need") {
    return (
      <Chip busy={busy} onClick={() => void set("unknown")} bg="var(--argile)" fg="var(--on-color)">
        <span>{name}</span>
        <span className="pl-1.5 opacity-80">{need}</span>
      </Chip>
    );
  }

  // En rayon on cherche le nom du paquet, pas la traduction anglaise.
  const shown = onPack ?? name;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1"
      style={{ background: "var(--surface2)" }}
      title={where ? `${shown} · ${where}` : shown}
    >
      <span className="text-[13px] font-bold">{shown}</span>
      <span className="tabnum text-[12px]" style={{ color: "var(--soft)" }}>
        {grams}
      </span>
      <button
        disabled={busy}
        onClick={() => void set("have")}
        title={have}
        aria-label={`${name}: ${have}`}
        className="ml-1 flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold transition-transform hover:scale-110"
        style={{ background: "var(--feuille)", color: "var(--on-color)" }}
      >
        ✓
      </button>
      <button
        disabled={busy}
        onClick={() => void set("need")}
        title={need}
        aria-label={`${name}: ${need}`}
        className="flex h-6 w-6 items-center justify-center rounded-full text-[15px] font-bold leading-none transition-transform hover:scale-110"
        style={{ background: "var(--argile)", color: "var(--on-color)" }}
      >
        +
      </button>
    </span>
  );
}

function Chip({
  children,
  onClick,
  bg,
  fg,
  busy,
}: {
  children: React.ReactNode;
  onClick: () => void;
  bg: string;
  fg: string;
  busy: boolean;
}) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className="inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-bold transition-opacity hover:opacity-85"
      style={{ background: bg, color: fg }}
    >
      {children}
    </button>
  );
}
