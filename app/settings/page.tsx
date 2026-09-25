import { needsWelcome } from "@/server/auth";
import { redirect } from "next/navigation";
import { getProfile } from "@/server/user";
import { getLang } from "@/server/lang";
import { Page, Band } from "@/ui/shell";
import { SettingsPanel } from "@/ui/settings-panel";
import { ResetButton } from "@/ui/reset-button";
import { PasswordChange } from "@/ui/password-change";
import { WhatsNewAgain } from "@/ui/whats-new-again";
import Link from "next/link";
import { currentAccount } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const lang = await getLang();
  const [profile, account] = await Promise.all([getProfile(), currentAccount()]);
  if (await needsWelcome()) redirect("/welcome");
  if (!profile?.onboarded) redirect("/onboarding");

  return (
    <Page>
      <Band
        title={lang === "fr" ? "Paramètres" : "Settings"}
        note={lang === "fr" ? "Enregistré au clic" : "Saved as you click"}
        color="var(--soft)"
      />

      <SettingsPanel
        lang={lang}
        initial={{
          breakfastDaysPerWeek: profile.breakfastDaysPerWeek,
          snackDaysPerWeek: profile.snackDaysPerWeek,
          weekStartsOn: profile.weekStartsOn,
          shoppingWeekday: profile.shoppingWeekday,
          meatPerMainMealG: profile.meatPerMainMealG,
          weeklyBudgetEur: profile.weeklyBudgetEur,
          spiceTolerance: profile.spiceTolerance,
          maxPans: profile.maxPans,
          kcalTarget: Math.round(profile.kcalTarget),
          proteinTargetG: Math.round(profile.proteinTargetG),
          kcalSplit: profile.kcalSplit,
        }}
      />

      <section className="mt-5 etal-card p-4">
        <h2 className="text-[16px] font-bold">{lang === "fr" ? "Ton compte" : "Your account"}</h2>
        <p className="mt-1 text-[13px]" style={{ color: "var(--soft)" }}>
          {account?.displayName ?? account?.name ?? ""}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <PasswordChange lang={lang} />
          <WhatsNewAgain lang={lang} />
          {account && account.greeting ? (
            <Link href="/welcome" className="text-[13px] font-semibold underline underline-offset-2" style={{ color: "var(--soft)" }}>
              {lang === "fr" ? "Relire le message de bienvenue" : "Read the welcome message again"}
            </Link>
          ) : null}
        </div>
      </section>

      <section className="mt-5 etal-card p-4">
        <h2 className="text-[16px] font-bold">{lang === "fr" ? "Repartir de zéro" : "Start over"}</h2>
        <p className="mt-1 text-[13px]" style={{ color: "var(--soft)" }}>
          {lang === "fr" ? "Goûts, plans et stock effacés. Les recettes restent." : "Tastes, plans and stock erased. Recipes stay."}
        </p>
        <div className="mt-3">
          <ResetButton lang={lang} />
        </div>
      </section>
    </Page>
  );
}
