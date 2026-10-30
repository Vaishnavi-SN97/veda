import type { Metadata, Viewport } from "next";
import { Onest, Oxanium } from "next/font/google";
import { DemoBanner } from "@/components/DemoBanner";
import { ServiceWorker } from "@/components/ServiceWorker";
import { THEME_BOOT_SCRIPT } from "@/components/themeScript";
import "./globals.css";

const oxanium = Oxanium({ variable: "--font-oxanium", subsets: ["latin"], weight: ["600", "700"] });
const onest = Onest({ variable: "--font-onest", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Veda RuralClass",
  description: "A multi-grade classroom planner with an AI study companion for rural schools.",
  applicationName: "Veda",
  appleWebApp: { capable: true, title: "Veda", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0B0A0C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${oxanium.variable} ${onest.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <DemoBanner />
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
