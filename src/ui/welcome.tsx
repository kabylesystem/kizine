"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mark } from "./mark";

export function Welcome({ name, first, onboarded }: { name: string; first: boolean; onboarded: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    await fetch("/api/welcome", { method: "POST" });
    router.replace(first && !onboarded ? "/onboarding" : onboarded ? "/" : "/onboarding");
    router.refresh();
  }
  return (
    <main className="kizine-card min-h-dvh bg-[#f6f1e9] px-5 py-10 text-[#22385c]">
      <div className="mx-auto flex min-h-[80dvh] max-w-[600px] flex-col items-center justify-center text-center">
        <Mark size={72} color="#22385c" />
        <h1 className="display mt-5 text-[clamp(52px,13vw,84px)] leading-none">Kizine</h1>
        <p className="mt-4 text-lg">Your kitchen, planned around your life.</p>
        <p className="mt-8 max-w-[440px] text-base leading-relaxed">
          Tell Kizine what you like and what you have. It plans meals, creates a shopping list,
          and adjusts the week when your plans change.
        </p>
        <button onClick={() => void open()} disabled={busy}
          className="mt-10 rounded-full bg-[#22385c] px-10 py-4 font-bold text-white disabled:opacity-60">
          {busy ? "…" : first ? "Get started" : "Continue"}
        </button>
      </div>
    </main>
  );
}
