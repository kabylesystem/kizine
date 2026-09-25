"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Effacer ses données demande deux gestes : un clic pour ouvrir, puis taper
 * RESET. Pas de fenêtre système qu'on valide sans lire.
 */
export function ResetButton({ lang }: { lang: "en" | "fr" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fr = lang === "fr";

  async function wipe() {
    setBusy(true);
    const res = await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "RESET" }),
    });
    if (res.ok) {
      router.replace("/onboarding");
      router.refresh();
      return;
    }
    // Un bouton qui échoue en silence est pire qu'un bouton absent.
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    setError(typeof data.error === "string" ? data.error : "it did not work");
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[13px] font-semibold underline underline-offset-2"
        style={{ color: "var(--soft)" }}
      >
        {fr ? "Tout effacer et recommencer" : "Erase everything and start over"}
      </button>
    );
  }

  return (
    <div className="etal-card p-4" style={{ boxShadow: "inset 0 0 0 2px var(--tomate)" }}>
      <h3 className="text-[16px] font-bold">{fr ? "Tout effacer ?" : "Erase everything?"}</h3>
      <p className="mt-1 max-w-[62ch] text-[13.5px] leading-snug" style={{ color: "var(--soft)" }}>
        {fr
          ? "Tes goûts, tes plans, ton stock, tes pesées, tes trajets et tes entraînements partent. Les 109 recettes et les tables de nutrition restent. C'est définitif, et tu repars sur l'onboarding."
          : "Your tastes, plans, stock, weigh-ins, trips and training go. The 109 recipes and the nutrition tables stay. This cannot be undone, and you land back on onboarding."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="RESET"
          className="w-[120px] rounded-[6px] px-3 py-2 text-[15px] font-bold"
          style={{ background: "var(--surface2)", color: "var(--ink)" }}
          aria-label="type RESET to confirm"
        />
        <button
          onClick={() => void wipe()}
          disabled={busy || typed !== "RESET"}
          className="etal-btn etal-btn--color text-[14px]"
          style={{ "--c": "#d63127" } as React.CSSProperties}
        >
          {busy ? (fr ? "Effacement…" : "Erasing…") : fr ? "Effacer" : "Erase"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
          className="etal-btn text-[14px]"
        >
          {fr ? "annuler" : "cancel"}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-[13px] font-semibold" style={{ color: "var(--tomate)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
