import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Familjen_Grotesk } from "next/font/google";
import "./globals.css";
import { TabBar } from "@/ui/tab-bar";
import { Frame } from "@/ui/frame";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const familjen = Familjen_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-familjen",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kizine",
  description: "Cook fresh, hit your number, decide nothing.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Kizine" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#d63127",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${familjen.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Frame>{children}</Frame>
        <TabBar />
      </body>
    </html>
  );
}
