import { notFound } from "next/navigation";
import { buildCookScreen } from "@/server/cook-service";
import { CookMode } from "@/ui/cook-mode";
import { getLang } from "@/server/lang";

export const dynamic = "force-dynamic";

export default async function CookPage({ params }: { params: Promise<{ slot: string }> }) {
  const { slot } = await params;
  const screen = await buildCookScreen(decodeURIComponent(slot));
  if (!screen) notFound();
  return <CookMode screen={JSON.parse(JSON.stringify(screen))} lang={await getLang()} />;
}
