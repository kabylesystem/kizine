"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RELEASE } from "@/data/releases";

/** La note de version, une fois, en haut de Today. « Compris » et elle disparaît. */
export function WhatsNew({ lang }: { lang: "en" | "fr" }) {
  const router = useRouter();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  async function dismiss() {
    setGone(true);
    await fetch("/api/release-seen", { method: "POST" });
    router.refresh();
  }

  return (
    <section className="mb-4 rounded-[9px] p-4" style={{ background: "var(--ink)", color: "var(--ground)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-[22px] leading-none">{RELEASE.title[lang]}</h2>
        <span className="text-[12px] font-semibold opacity-70">{RELEASE.date[lang]}</span>
      </div>
      <p className="mt-2 text-[13.5px] leading-snug opacity-85">{RELEASE.intro[lang]}</p>
      <ul className="mt-3 flex flex-col gap-2 text-[13.5px] leading-snug">
        {RELEASE.items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--argile)" }} />
            <span>{it[lang]}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={() => void dismiss()}
        className="mt-3 rounded-full px-4 py-1.5 text-[13px] font-bold"
        style={{ background: "var(--argile)", color: "var(--on-color)" }}
      >
        {lang === "fr" ? "Compris" : "Got it"}
      </button>
    </section>
  );
}
