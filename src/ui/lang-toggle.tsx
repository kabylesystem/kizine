"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Bascule EN / FR sur les noms d'aliments et de plats. Se retire le jour où il n'en a plus besoin. */
export function LangToggle() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<"en" | "fr">("en");

  useEffect(() => {
    setLang(/(?:^|;\s*)lang=fr(?:;|$)/.test(document.cookie) ? "fr" : "en");
  }, []);

  function flip() {
    const next = lang === "fr" ? "en" : "fr";
    setBusy(true);
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    setLang(next);
    router.refresh();
    setTimeout(() => setBusy(false), 400);
  }

  return (
    <button
      onClick={flip}
      disabled={busy}
      title={lang === "fr" ? "Show food names in English" : "Afficher les noms en français"}
      aria-label={lang === "fr" ? "Switch to English" : "Passer en français"}
      className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold tracking-wide"
      style={{ background: "var(--surface2)", color: "var(--soft)" }}
    >
      <span style={{ color: lang === "en" ? "var(--ink)" : undefined }}>EN</span>
      <span style={{ opacity: 0.4 }}>/</span>
      <span style={{ color: lang === "fr" ? "var(--ink)" : undefined }}>FR</span>
    </button>
  );
}
