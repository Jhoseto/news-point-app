import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { unstable_cache } from "next/cache";
import "./globals.css";
import { SiteBody, SiteHeader } from "@/components/site-chrome";
import { JsonLd } from "@/components/json-ld";
import { MobileChromeIsland } from "@/components/mobile-chrome-island";
import { DeferredChrome } from "@/components/deferred-chrome";
import { ViewportShellGate } from "@/components/viewport-shell-gate";
import { ssrDesktopViewport } from "@/lib/ssr-viewport";
import { PodcastProvider } from "@/components/podcast/provider";
import { LivePointProvider } from "@/components/livepoint/livepoint-provider";
import { ThemeScript } from "@/components/theme-script";
import { PwaSplash } from "@/components/pwa-splash";
import { MANROPE_FACE_CSS } from "@/lib/manrope-face";
import { hasVerifiedLiveCamera } from "@/lib/livepoint/cameras/catalog";
import { isTomTomConfigured } from "@/lib/livepoint/config";
import { toLatestHeadline } from "@/lib/livepoint/serialize";
import { getWeatherForecast } from "@/lib/livepoint/weather/met-norway";
import { getLatest, getMenuCategories } from "@/lib/queries";
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
    ],
    shortcut: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/brand/apple-touch-icon.png?v=7", sizes: "180x180", type: "image/png" },
      { url: "/brand/apple-touch-icon-167.png?v=7", sizes: "167x167", type: "image/png" },
      { url: "/brand/apple-touch-icon-152.png?v=7", sizes: "152x152", type: "image/png" },
      { url: "/brand/apple-touch-icon-120.png?v=7", sizes: "120x120", type: "image/png" },
    ],
    other: [
      { rel: "apple-touch-startup-image", url: "/brand/splash-750x1334.png?v=7", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/brand/splash-750x1334-dark.png?v=7", media: "(prefers-color-scheme: dark) and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/brand/splash-1170x2532.png?v=7", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/brand/splash-1170x2532-dark.png?v=7", media: "(prefers-color-scheme: dark) and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/brand/splash-1242x2688.png?v=7", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/brand/splash-1242x2688-dark.png?v=7", media: "(prefers-color-scheme: dark) and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/brand/splash-1320x2868.png?v=7", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/brand/splash-1320x2868-dark.png?v=7", media: "(prefers-color-scheme: dark) and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/brand/splash-2048x2732.png?v=7", media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/brand/splash-2048x2732-dark.png?v=7", media: "(prefers-color-scheme: dark) and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
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
  const [{ weather, latest }, menu, desktop] = await Promise.all([loadPublicShell(), getMenuCategories(), ssrDesktopViewport()]);
  const origin = shareOrigin();
  const organization = newsMediaOrganization({ origin, contact: { phone: PUBLIC_CONTACT.phone, email: PUBLIC_CONTACT.email, street: PUBLIC_CONTACT.street, city: "Пловдив", countryCode: "BG" } });
  const website = webSite(origin, organization["@id"] as string);
  const mobileRubrics = menu.map(({ slug, name, path }) => ({ slug, name, path }));
  return (
    <html lang="bg" suppressHydrationWarning>
      <head>
        <link rel="describedby" href="/llms.txt" type="text/plain" />
        {/* Inline @font-face — avoids an extra render-blocking CSS request for Manrope. */}
        <style dangerouslySetInnerHTML={{ __html: MANROPE_FACE_CSS }} />
        <link rel="preload" href="/fonts/manrope-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        <JsonLd data={[organization, website]} id="np-ld-org-website" />
      </head>
      <body className="min-h-[100dvh]">
        <ThemeScript />
        <PwaSplash />
        <ViewportShellGate ssrDesktop={desktop} />
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
          <MobileChromeIsland rubrics={mobileRubrics} />
        </LivePointProvider>
        </PodcastProvider>
        <DeferredChrome />
      </body>
    </html>
  );
}
