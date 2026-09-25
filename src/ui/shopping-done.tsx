"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Un passage en caisse remplit le stock. Un clic de trop se défait, sans perdre la liste. */
export function ShoppingDone() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ added: number; batch: string } | null>(null);

  async function go() {
    setBusy(true);
    const res = await fetch("/api/shopping-done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = (await res.json()) as { added?: number; batch?: string };
    if (data.batch) setDone({ added: data.added ?? 0, batch: data.batch });
    router.refresh();
    setBusy(false);
  }

  async function undo() {
    if (!done) return;
    setBusy(true);
    await fetch("/api/shopping-done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ undo: done.batch }),
    });
    setDone(null);
    router.refresh();
    setBusy(false);
  }

  if (done) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold" style={{ color: "var(--feuille)" }}>
          {done.added} items in stock
        </span>
        <button onClick={undo} disabled={busy} className="etal-btn etal-btn--quiet text-[13px]">
          {busy ? "Undoing…" : "Undo"}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={go}
      disabled={busy}
      className="etal-btn etal-btn--color text-[14px]"
      style={{ "--c": "#137a42" } as React.CSSProperties}
    >
      {busy ? "Filling stock…" : "Shopping done"}
    </button>
  );
}
