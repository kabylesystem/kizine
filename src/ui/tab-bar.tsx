"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "./mark";

const TABS = [
  { href: "/", label: "Today", color: "var(--argile)", icon: "today", hint: "T" },
  { href: "/week", label: "Week", color: "var(--myrtille)", icon: "week", hint: "W" },
  { href: "/groceries", label: "Shop", color: "var(--feuille)", icon: "shop", hint: "S" },
  { href: "/pantry", label: "Stock", color: "var(--curcuma)", icon: "stock", hint: "K" },
  { href: "/stats", label: "Numbers", color: "var(--aubergine)", icon: "stats", hint: "N" },
  { href: "/settings", label: "Settings", color: "var(--soft)", icon: "settings", hint: "," },
] as const;

function Glyph({ name }: { name: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.1,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      {name === "today" && (
        <>
          <path {...common} d="M4 7h16" />
          <path {...common} d="M6 7v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
          <path {...common} d="M9 4h6" />
          <path {...common} d="M12 11v5" />
        </>
      )}
      {name === "week" && (
        <>
          <rect {...common} x="3" y="5" width="18" height="16" rx="2" />
          <path {...common} d="M3 10h18M9 5V3M15 5V3" />
        </>
      )}
      {name === "shop" && (
        <>
          <path {...common} d="M5 8h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8Z" />
          <path {...common} d="M9 8V6a3 3 0 0 1 6 0v2" />
        </>
      )}
      {name === "stats" && (
        <>
          <path {...common} d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </>
      )}
      {name === "stock" && (
        <>
          <rect {...common} x="4" y="3" width="16" height="18" rx="2" />
          <path {...common} d="M4 11h16M9 7v1M9 15v1" />
        </>
      )}
      {name === "settings" && (
        <>
          <circle {...common} cx="12" cy="12" r="3" />
          <path
            {...common}
            strokeWidth={1.9}
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
          />
        </>
      )}
    </svg>
  );
}

export function TabBar() {
  const path = usePathname();
  if (path.startsWith("/onboarding") || path.startsWith("/cook") || path.startsWith("/login") || path.startsWith("/welcome")) return null;
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      {/* Desktop : rail à gauche */}
      <nav
        className="fixed left-0 top-0 z-40 hidden h-dvh w-[212px] flex-col gap-1 border-r p-4 lg:flex"
        style={{ background: "var(--ground)", borderColor: "var(--line)" }}
      >
        <Link href="/" className="mb-6 flex items-center gap-2 no-underline" style={{ color: "var(--ink)" }}>
          <Mark size={26} color="var(--argile)" />
          <span className="display text-[28px] leading-none">Kizine</span>
        </Link>
        {TABS.map((t) => {
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              prefetch
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-semibold no-underline transition-all duration-200 hover:translate-x-0.5"
              style={{
                background: active ? t.color : "transparent",
                color: active ? "var(--on-color)" : "var(--soft)",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = "var(--surface)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              <Glyph name={t.icon} />
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile : barre en bas */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t lg:hidden"
        style={{ background: "var(--ground)", borderColor: "var(--line)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => {
            const active = isActive(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                prefetch
                className="flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 no-underline transition-transform duration-200"
                style={{ color: active ? "var(--ink)" : "var(--soft)" }}
              >
                <span
                  className="flex h-8 w-10 items-center justify-center rounded-full transition-colors duration-200"
                  style={{ background: active ? t.color : "transparent", color: active ? "var(--on-color)" : "inherit" }}
                >
                  <Glyph name={t.icon} />
                </span>
                <span className="text-[10px] font-semibold tracking-tight">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
