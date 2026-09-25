import { Onboarding } from "@/ui/onboarding/onboarding";
import { loadOnboardingData } from "@/server/onboarding-data";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const data = await loadOnboardingData();
  return <Onboarding data={data} />;
}
