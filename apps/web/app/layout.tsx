import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { unstable_cache } from "next/cache";
import "@fontsource-variable/manrope";
import "./globals.css";
import { SiteBody, SiteHeader } from "@/components/site-chrome";
import { JsonLd } from "@/components/json-ld";
import { MobileChromeIsland } from "@/components/mobile-chrome-island";
import { PwaInstall } from "@/components/pwa-install";
import { PushPromptToast } from "@/components/push-prompt-toast";
import { PwaRegister } from "@/components/pwa-register";
import { PwaSplash } from "@/components/pwa-splash";
import { PodcastProvider } from "@/components/podcast/player";
import { LivePointProvider } from "@/components/livepoint/livepoint-provider";
import { LiveUpdates } from "@/components/live-updates";
import { SpotlightField } from "@/components/spotlight-field";
import { ThemeScript } from "@/components/theme-script";
import { hasVerifiedLiveCamera } from "@/lib/livepoint/cameras/catalog";
import { isTomTomConfigured } from "@/lib/livepoint/config";
import { toLatestHeadline } from "@/lib/livepoint/serialize";
import { getWeatherForecast } from "@/lib/livepoint/weather/met-norway";
import { getLatest } from "@/lib/queries";
import { newsMediaOrganization, webSite } from "@/lib/jsonld";
import { shareOrigin } from "@/lib/share-card";
import { PUBLIC_CONTACT } from "@/lib/public-contact";

/** Shared with pages that export the same value. A dynamic child still renders per request. */
export const revalidate = 60;

// Weather stays inside this cache. A no-store fetch here marks the whole site dynamic and 500s under ISR.
const loadPublicShell = unstable_cache(async () => {
  const [weather, latestArticles] = await Promise.all([getWeatherForecast(), getLatest(1)]);
  return { weather, latest: toLatestHeadline(latestArticles[0]) };
}, ["public-shell"], { revalidate: 60 });

export const metadata: Metadata = {
  title: { default: "NewsPoint.bg – Гласът на истината", template: "%s | NewsPoint.bg" },
  appleWebApp: { title: "NewsPoint" },
  description: "Новини от Пловдив, България и света.",
  robots: { index: false, follow: false, "max-image-preview": "large" },
  alternates: { types: { "application/rss+xml": "/feed/" } },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/mark-favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/brand/apple-touch-icon-167.png", sizes: "167x167", type: "image/png" },
      { url: "/brand/apple-touch-icon-152.png", sizes: "152x152", type: "image/png" },
      { url: "/brand/apple-touch-icon-120.png", sizes: "120x120", type: "image/png" },
    ],
    other: [
      {
        rel: "apple-touch-startup-image",
        url: "/brand/splash-1170x2532.png",
        media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        rel: "apple-touch-startup-image",
        url: "/brand/splash-1170x2532-dark.png",
        media: "(prefers-color-scheme: dark) and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000516" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { weather, latest } = await loadPublicShell();
  const origin = shareOrigin();
  const organization = newsMediaOrganization({ origin, contact: { phone: PUBLIC_CONTACT.phone, email: PUBLIC_CONTACT.email, street: PUBLIC_CONTACT.street, city: "Пловдив", countryCode: "BG" } });
  const website = webSite(origin, organization["@id"] as string);
  return (
    <html lang="bg" suppressHydrationWarning>
      <head>
        <link rel="describedby" href="/llms.txt" type="text/plain" />
        <JsonLd data={[organization, website]} id="np-ld-org-website" />
      </head>
      <body className="min-h-[var(--np-desktop-height,100dvh)]">
        <ThemeScript />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold focus:text-ink"
        >
          Към съдържанието
        </a>
        <PodcastProvider>
        <LivePointProvider
          weather={weather}
          trafficConnected={isTomTomConfigured()}
          camerasLiveLabel={hasVerifiedLiveCamera()}
          latest={latest}
        >
          <SiteHeader />
          <SiteBody>{children}</SiteBody>
          <MobileChromeIsland />
        </LivePointProvider>
        </PodcastProvider>
        <LiveUpdates />
        <SpotlightField />
        <PwaInstall />
        <PushPromptToast />
        <PwaRegister />
        <PwaSplash />
      </body>
    </html>
  );
}
