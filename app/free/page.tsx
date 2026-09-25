import { needsWelcome } from "@/server/auth";
import { redirect } from "next/navigation";
import { getProfile } from "@/server/user";
import { getLang } from "@/server/lang";
import { Page, Band } from "@/ui/shell";
import { FreeDishForm } from "@/ui/free-dish-form";
import { FreeDishCard } from "@/ui/free-dish-card";
import { listFreeDishes, upcomingMainSlots } from "@/server/free-dish";

export const dynamic = "force-dynamic";

/**
 * Le mode libre : ce qu'on a cuisiné sans le plan, compté à la louche et posé
 * sur les repas de la semaine. Le petit-déjeuner reste compté au gramme, le
 * reste porte un ≈ et c'est très bien comme ça.
 */
export default async function FreePage() {
  const [lang, profile] = await Promise.all([getLang(), getProfile()]);
  if (await needsWelcome()) redirect("/welcome");
  if (!profile?.onboarded) redirect("/onboarding");
  const [dishes, targets] = await Promise.all([listFreeDishes(), upcomingMainSlots()]);

  return (
    <Page>
      <Band
        title={lang === "fr" ? "Marmites" : "Batch cooking"}
        note={
          lang === "fr"
            ? "Une marmite comptée à la louche depuis ses ingrédients, découpée en portions, étalée sur la semaine."
            : "A pot counted roughly from its ingredients, split into portions, spread over the week."
        }
        color="var(--argile)"
      />
      <div className="flex flex-col gap-4">
        <FreeDishForm lang={lang} />
        {dishes.filter((d) => d.portions > 1).map((d) => (
          <FreeDishCard key={d.id} dish={d} targets={targets} lang={lang} />
        ))}
      </div>
    </Page>
  );
}
