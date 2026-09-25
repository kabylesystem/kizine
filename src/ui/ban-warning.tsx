"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Blocker } from "@/server/blockers";

/**
 * Une alerte qui se répare elle-même : elle nomme l'aliment, dit combien de
 * recettes il supprime, et le débannit en un clic.
 */
export function BanWarning({
  blockers,
  unfilled,
  lang,
}: {
  blockers: Blocker[];
  unfilled: number;
  lang: "en" | "fr";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (blockers.length === 0) return null;

  async function unban(conceptId: string) {
    setBusy(conceptId);
    await fetch("/api/preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conceptId, action: "reset" }),
    });
    router.refresh();
    setBusy(null);
  }

  return (
    <div
      className="mb-3 rounded-[7px] p-4"
      style={{ background: "var(--curcuma)", color: "var(--on-color)" }}
    >
      <h2 className="text-[16px] font-bold leading-tight">
        {unfilled > 0
          ? lang === "fr"
            ? `${unfilled} repas n'ont pas pu être planifiés`
            : `${unfilled} meals could not be planned`
          : lang === "fr"
            ? "Tes exclusions coupent une grande partie du livre"
            : "Your exclusions cut out a large part of the book"}
      </h2>
      <p className="mt-1 max-w-[64ch] text-[13.5px] leading-snug opacity-95">
        {lang === "fr"
          ? "Ces aliments sont marqués « jamais ». Un ingrédient de base retiré supprime toutes les recettes qui l'utilisent, même celles que tu aimes. Touche-en un pour l'autoriser à nouveau."
          : "These are marked never. Taking out a base ingredient removes every recipe that uses it, including ones you like. Tap one to allow it again."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {blockers.map((b) => (
          <button
            key={b.conceptId}
            onClick={() => void unban(b.conceptId)}
            disabled={busy !== null}
            className="flex items-baseline gap-2 rounded-full bg-black/25 px-3 py-1.5 text-[13px] font-bold transition-opacity hover:opacity-80"
          >
            <span>{b.name}</span>
            <span className="tabnum opacity-80">
              −{b.blocked} {lang === "fr" ? "recettes" : "recipes"}
            </span>
            <span className="opacity-70">{busy === b.conceptId ? "…" : "↺"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
