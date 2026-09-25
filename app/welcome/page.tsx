import { redirect } from "next/navigation";
import { currentAccount, needsWelcome } from "@/server/auth";
import { Welcome } from "@/ui/welcome";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const account = await currentAccount();
  if (!account) redirect("/login");
  return (
    <Welcome name={account.displayName ?? account.name} first={await needsWelcome()} onboarded={account.onboarded} />
  );
}
