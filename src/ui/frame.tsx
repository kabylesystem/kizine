"use client";

import { usePathname } from "next/navigation";

/** Le rail de gauche n'existe pas pendant l'onboarding ni en Cook Mode : pas de décalage. */
export function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const bare = path.startsWith("/onboarding") || path.startsWith("/cook") || path.startsWith("/login") || path.startsWith("/welcome");
  return <div className={bare ? "min-h-dvh" : "min-h-dvh pb-24 lg:pb-0 lg:pl-[212px]"}>{children}</div>;
}
