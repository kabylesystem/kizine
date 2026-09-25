"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WeighIn({ last }: { last: number | null }) {
  const router = useRouter();
  const [kg, setKg] = useState(last ?? 62);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await fetch("/api/weight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kg }),
    });
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="etal-card flex flex-wrap items-center gap-3 p-3">
      <span className="text-[14px] font-bold">Weigh in</span>
      <input
        type="range"
        min={45}
        max={110}
        step={0.1}
        value={kg}
        onChange={(e) => setKg(Number(e.target.value))}
        className="etal-slider min-w-[160px] flex-1"
        aria-label="weight in kilograms"
      />
      <span className="tabnum w-[76px] text-right text-[18px] font-bold">{kg.toFixed(1)} kg</span>
      <button
        onClick={save}
        disabled={busy}
        className="etal-btn etal-btn--color text-[14px]"
        style={{ "--c": "#d63127" } as React.CSSProperties}
      >
        {busy ? "Saving…" : "Log today"}
      </button>
    </div>
  );
}
