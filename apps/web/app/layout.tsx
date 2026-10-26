import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { unstable_cache } from "next/cache";
import "./globals.css";
import { SiteBody, SiteHeader } from "@/components/site-chrome";
import { JsonLd } from "@/components/json-ld";
import { MobileChromeIsland } from "@/components/mobile-chrome-island";
import { cityGuideEnabled } from "@/lib/city-guide/access";
import { DeferredChrome } from "@/components/deferred-chrome";
import { ViewportShellGate } from "@/components/viewport-shell-gate";
import { ssrDesktopViewport } from "@/lib/ssr-viewport";
import { ThemeScript } from "@/components/theme-script";
import { PwaSplash } from "@/components/pwa-splash";
import { PWA_LAUNCH_SCRIPT } from "@/lib/pwa-launch";
import { MANROPE_FACE_CSS } from "@/lib/manrope-face";
import { hasVerifiedLiveCamera } from "@/lib/livepoint/cameras/catalog";
import { isTomTomConfigured } from "@/lib/livepoint/config";
import { toLatestHeadline } from "@/lib/livepoint/serialize";
import { getWeatherForecast } from "@/lib/livepoint/weather/met-norway";
import { getLatest, getMenuCategories } from "@/lib/queries";
import { newsMediaOrganization, webSite } from "@/lib/jsonld";
import { shareOrigin } from "@/lib/share-card";
import { SITE_OG_IMAGE, SITE_OG_IMAGE_ALT } from "@/lib/public-metadata";
import { PUBLIC_CONTACT } from "@/lib/public-contact";
import { PublicAnalyticsGate } from "@/components/public-analytics-gate";
import { ClickyAnalyticsGate } from "@/components/clicky-analytics-gate";
import { CookieConsent } from "@/components/cookie-consent";
import { LivePointProvider } from "@/components/livepoint/livepoint-provider";
import { PodcastRoot } from "@/components/podcast/podcast-root";
import { publicRobotsMetadata } from "@/lib/indexing-policy.mjs";

/** Shared with pages that export the same value. A dynamic child still renders per request. */
export const revalidate = 60;

// Weather stays inside this cache. A no-store fetch here marks the whole site dynamic and 500s under ISR.
const loadPublicShell = unstable_cache(async () => {
  const [weather, latestArticles] = await Promise.all([getWeatherForecast(), getLatest(1)]);
  return { weather, latest: toLatestHeadline(latestArticles[0]) };
}, ["public-shell"], { revalidate: 60 });

const siteOrigin = shareOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { default: "NewsPoint.bg – Гласът на истината", template: "%s | NewsPoint.bg" },
  appleWebApp: { title: "NewsPoint" },
  description: "Новини от Пловдив, България и света.",
  robots: publicRobotsMetadata(),
  alternates: { types: { "application/rss+xml": "/feed/" } },
  manifest: "/manifest.webmanifest",
  openGraph: {
    siteName: "NewsPoint.bg",
    locale: "bg_BG",
    type: "website",
    images: [{ url: SITE_OG_IMAGE, width: 1200, height: 630, alt: SITE_OG_IMAGE_ALT, type: "image/jpeg" }],
  },
  twitter: { card: "summary_large_image", images: [SITE_OG_IMAGE] },
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/brand/apple-touch-icon.png?v=8", sizes: "180x180", type: "image/png" },
      { url: "/brand/apple-touch-icon-167.png?v=8", sizes: "167x167", type: "image/png" },
      { url: "/brand/apple-touch-icon-152.png?v=8", sizes: "152x152", type: "image/png" },
      { url: "/brand/apple-touch-icon-120.png?v=8", sizes: "120x120", type: "image/png" },
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
        <script dangerouslySetInnerHTML={{ __html: PWA_LAUNCH_SCRIPT }} />
        <link rel="describedby" href="/llms.txt" type="text/plain" />
        {/* Inline @font-face — avoids an extra render-blocking CSS request for Manrope. */}
        <link rel="preload" href="/fonts/manrope-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <style dangerouslySetInnerHTML={{ __html: MANROPE_FACE_CSS }} />
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
        <PodcastRoot>
          <LivePointProvider
            weather={weather}
            latest={latest}
            trafficConnected={isTomTomConfigured()}
            camerasLiveLabel={hasVerifiedLiveCamera()}
          >
            <SiteHeader />
            <SiteBody>{children}</SiteBody>
            <MobileChromeIsland rubrics={mobileRubrics} cityEnabled={cityGuideEnabled()} />
          </LivePointProvider>
        </PodcastRoot>
        <DeferredChrome />
        <PublicAnalyticsGate />
        <ClickyAnalyticsGate />
        <CookieConsent />
      </body>
    </html>
  );
}
