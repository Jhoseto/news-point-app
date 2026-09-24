import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/manrope";
import "./globals.css";
import { BottomNav, SiteBody, SiteHeader } from "@/components/site-chrome";
import { LivePointProvider } from "@/components/livepoint/livepoint-provider";
import { LiveUpdates } from "@/components/live-updates";
import { ThemeScript } from "@/components/theme-script";
import { hasVerifiedLiveCamera } from "@/lib/livepoint/cameras/catalog";
import { isTomTomConfigured } from "@/lib/livepoint/config";
import { toLatestHeadline } from "@/lib/livepoint/serialize";
import { getWeatherForecast } from "@/lib/livepoint/weather/met-norway";
import { getLatest } from "@/lib/queries";

export const metadata: Metadata = {
  title: { default: "NewsPoint.bg – Гласът на истината", template: "%s | NewsPoint.bg" },
  description: "Новини от Пловдив, България и света.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000516" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [weather, latestArticles] = await Promise.all([getWeatherForecast(), getLatest(1)]);
  return (
    <html lang="bg" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold focus:text-ink"
        >
          Към съдържанието
        </a>
        <LivePointProvider
          weather={weather}
          trafficConnected={isTomTomConfigured()}
          camerasLiveLabel={hasVerifiedLiveCamera()}
          latest={toLatestHeadline(latestArticles[0])}
        >
          <SiteHeader />
          <SiteBody>{children}</SiteBody>
          <BottomNav />
        </LivePointProvider>
        <LiveUpdates />
      </body>
    </html>
  );
}
