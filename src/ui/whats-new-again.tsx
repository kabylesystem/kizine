"use client";

import { useRouter } from "next/navigation";

export function WhatsNewAgain({ lang }: { lang: "en" | "fr" }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/release-seen", { method: "DELETE" });
        router.push("/");
      }}
      className="text-[13px] font-semibold underline underline-offset-2"
      style={{ color: "var(--soft)" }}
    >
      {lang === "fr" ? "Relire « Ce qui a changé »" : "Read « What changed » again"}
    </button>
  );
}
