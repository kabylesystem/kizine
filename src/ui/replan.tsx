"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function Replan({ weekStart }: { weekStart?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    await fetch("/api/replan", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    router.refresh();
    setBusy(false);
  }

  return (
    <button onClick={go} disabled={busy} className="etal-btn etal-btn--quiet text-[14px]">
      {busy ? "Rebuilding…" : "Shuffle the week"}
    </button>
  );
}
