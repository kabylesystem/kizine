"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Un tap : mangé tel que prévu. Plat connu, pas pesé, donc compté ≈. */
export function AteButton({ slotId, lang }: { slotId: string; lang: "en" | "fr" }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function ate() {
    setBusy(true);
    setDone(true);
    const res = await fetch("/api/meal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, action: "ate" }),
    });
    if (!res.ok) setDone(false);
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      onClick={ate}
      disabled={busy || done}
      title={lang === "fr" ? "Mangé tel que prévu" : "Ate it as planned"}
      aria-label={lang === "fr" ? "Mangé tel que prévu" : "Ate it as planned"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold transition-transform hover:scale-110 disabled:opacity-60"
      style={{ background: done ? "var(--feuille)" : "var(--surface2)", color: done ? "var(--on-color)" : "var(--feuille)" }}
    >
      ✓
    </button>
  );
}
