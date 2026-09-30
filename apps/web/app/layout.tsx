import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { unstable_cache } from "next/cache";
import "@fontsource-variable/manrope";
import "./globals.css";
import { BottomNav, SiteBody, SiteHeader } from "@/components/site-chrome";
import { LivePointProvider } from "@/components/livepoint/livepoint-provider";
import { LiveUpdates } from "@/components/live-updates";
import { SpotlightField } from "@/components/spotlight-field";
import { ThemeScript } from "@/components/theme-script";
import { hasVerifiedLiveCamera } from "@/lib/livepoint/cameras/catalog";
import { isTomTomConfigured } from "@/lib/livepoint/config";
import { toLatestHeadline } from "@/lib/livepoint/serialize";
import { getWeatherForecast } from "@/lib/livepoint/weather/met-norway";
import { getLatest } from "@/lib/queries";

/** Shared with pages that export the same value. A dynamic child still renders per request. */
export const revalidate = 60;

// The weather fetch is uncached on purpose. Running it inside this cache keeps
// that from forcing every page to render on each visit.
const loadPublicShell = unstable_cache(async () => {
  const [weather, latestArticles] = await Promise.all([getWeatherForecast(), getLatest(1)]);
  return { weather, latest: toLatestHeadline(latestArticles[0]) };
}, ["public-shell"], { revalidate: 60 });

export const metadata: Metadata = {
  title: { default: "NewsPoint.bg – Гласът на истината", template: "%s | NewsPoint.bg" },
  description: "Новини от Пловдив, България и света.",
  robots: { index: false, follow: false },
  alternates: { types: { "application/rss+xml": "/feed/" } },
  icons: {
    icon: [{ url: "/brand/mark-favicon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/brand/mark-favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/brand/mark-favicon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000516" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { weather, latest } = await loadPublicShell();
  return (
    <html lang="bg" suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeScript />
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
          latest={latest}
        >
          <SiteHeader />
          <SiteBody>{children}</SiteBody>
          <BottomNav />
        </LivePointProvider>
        <LiveUpdates />
        <SpotlightField />
      </body>
    </html>
  );
}
