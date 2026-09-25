"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Le prix dit d'où il vient. Un tap suffit pour le corriger avec le vrai prix
 * du magasin de default-user : à partir de là c'est le sien qui compte.
 */
export function PriceTag({
  conceptId,
  name,
  cents,
  source,
  boughtG,
}: {
  conceptId: string;
  name: string;
  cents: number | null;
  source: "mine" | "reference" | "none";
  boughtG: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1000");
  const [store, setStore] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const p = Number(price.replace(",", "."));
    const q = Number(qty);
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q <= 0) return;
    setBusy(true);
    await fetch("/api/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conceptId, priceCents: Math.round(p * 100), quantityG: q, store: store || undefined }),
    });
    setOpen(false);
    setBusy(false);
    router.refresh();
  }

  if (open) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-[12px] font-bold">{name}:</span>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder="prix"
          className="w-[72px] rounded-md px-2 py-1 text-[13px]"
          style={{ background: "var(--surface2)", border: "0" }}
        />
        <span className="text-[12px]">€ for</span>
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="numeric"
          className="w-[72px] rounded-md px-2 py-1 text-[13px]"
          style={{ background: "var(--surface2)", border: "0" }}
        />
        <span className="text-[12px]">g at</span>
        <input
          value={store}
          onChange={(e) => setStore(e.target.value)}
          placeholder="store"
          className="w-[100px] rounded-md px-2 py-1 text-[13px]"
          style={{ background: "var(--surface2)", border: "0" }}
        />
        <button onClick={save} disabled={busy} className="etal-btn etal-btn--quiet px-3 py-1 text-[12px]">
          {busy ? "…" : "Save"}
        </button>
        <button onClick={() => setOpen(false)} className="px-2 text-[12px]" style={{ color: "var(--soft)" }}>
          cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
      className="tabnum text-[12px] font-semibold underline-offset-2 hover:underline"
      style={{ color: source === "mine" ? "var(--feuille)" : "var(--soft)" }}
      title={
        source === "mine"
          ? "your own price, from what you actually paid"
          : source === "reference"
            ? "Own-brand French supermarket average, 2026. Not your Intermarché. Tap to put in the real shelf price."
            : "no price yet. Tap to add one."
      }
    >
      {cents === null ? "add price" : `${((cents * boughtG) / 1000 / 100).toFixed(2)} €`}
      <span className="pl-1 opacity-70">{source === "mine" ? "\u00b7 Intermarch\u00e9" : source === "reference" ? "\u00b7 est." : ""}</span>
    </button>
  );
}
