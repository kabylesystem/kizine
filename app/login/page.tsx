import { redirect } from "next/navigation";
import { isLoggedIn, listAccounts } from "@/server/auth";
import { LoginForm } from "@/ui/login-form";
import { Mark } from "@/ui/mark";

export const dynamic = "force-dynamic";

/**
 * Écran partagé par les deux comptes : il porte l'identité de Kizine, pas le
 * thème sombre de l'app. C'est la porte d'entrée, elle a le droit d'être jolie.
 */
export default async function Login() {
  if (await isLoggedIn()) redirect("/");
  const accounts = await listAccounts();
  return (
    <main className="kizine-login flex min-h-dvh items-center justify-center px-5 py-10" style={{ background: "#f6f1e9" }}>
      <div className="relative w-full max-w-[400px]">
        <span className="pointer-events-none absolute -left-2 -top-6 block h-6 w-6 rounded-full" style={{ background: "#8aa06b" }} aria-hidden />
        <span className="pointer-events-none absolute -right-1 -top-10 block h-7 w-7 rounded-full" style={{ background: "#22385c" }} aria-hidden />
        <span className="pointer-events-none absolute -right-6 top-6 block h-5 w-5 rounded-full" style={{ border: "3px solid #e07ba4" }} aria-hidden />

        <div className="flex flex-col items-center text-center">
          <div
            className="flex h-[128px] w-[128px] items-center justify-center rounded-full"
            style={{ background: "#f4dfe6" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/us/nous.png" alt="" className="h-[112px] w-[112px] object-contain" />
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Mark size={44} color="#e07ba4" />
            <h1 className="display text-[64px] leading-[0.85]" style={{ color: "#22385c" }}>
              Kizine
            </h1>
          </div>
          <p className="mt-2 text-[14.5px] italic" style={{ color: "#7c7468" }}>
            it means kitchen, in Haitian Creole
          </p>
        </div>

        <LoginForm accounts={accounts.map((a) => ({ id: a.id, name: a.displayName ?? a.name }))} />
      </div>
    </main>
  );
}
