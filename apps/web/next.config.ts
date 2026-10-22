import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";
import { indexingHeaderRules } from "./lib/indexing-policy.mjs";
import { developmentSlashRedirects } from "./lib/dev-trailing-slash";

const repoRoot = resolve(import.meta.dirname, "../..");
loadEnvConfig(repoRoot);

function mediaOrigin(): string {
  const value = (process.env.MEDIA_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.username || url.password) return "";
    return url.origin;
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ["@newspoint/db", "@newspoint/content"],
  turbopack: { root: repoRoot },
  // Resumable video/podcast requests are <=4 MiB. Keep enough room for the
  // remaining 30 MiB music /25 MiB image forms, including multipart overhead.
  // This also bounds rewrite buffering below Cloudflare's smallest upload cap.
  experimental: {
    proxyClientMaxBodySize: "32mb",
    optimizePackageImports: ["@newspoint/content", "@newspoint/db"],
  },
  // Preserve the pinned Next list (social previews included) and put metadata
  // in <head> for AI readers that do not execute streamed client scripts.
  // Recheck this Next internal export when upgrading the pinned version.
  htmlLimitedBots: new RegExp(`${HTML_LIMITED_BOT_UA_RE.source}|Googlebot|OAI-SearchBot|ChatGPT-User|PerplexityBot|Perplexity-User|Claude-SearchBot|Claude-User`, "i"),
  // Cloudflare quick tunnel (trycloudflare.com): without this, dev blocks /_next and client UI breaks.
  ...(process.env.NODE_ENV === "development"
    ? {
        allowedDevOrigins: ["localhost", "127.0.0.1", ".trycloudflare.com"],
        skipTrailingSlashRedirect: true,
      }
    : {}),
  // WordPress URLs end with a slash; imported paths are kept exactly (DEC-105).
  trailingSlash: true,
  async redirects() {
    const sitemaps = ["/sitemap_index.xml", "/post-sitemap.xml", "/category-sitemap.xml"].map(source => ({ source, destination: "/sitemap.xml", permanent: true }));
    return [...sitemaps, ...(process.env.NODE_ENV === "development" ? developmentSlashRedirects() : [])];
  },
  // Studio (apps/studio, basePath /admin) is served through this host at /admin.
  // Pages keep the trailing slash; static files have none.
  async rewrites() {
    const studio = (process.env.STUDIO_URL ?? "http://localhost:3001").replace(/\/+$/, "");
    return {
      beforeFiles: [
        { source: "/admin/", destination: `${studio}/admin/` },
        { source: "/admin/:path*/", destination: `${studio}/admin/:path*/` },
        { source: "/admin/:path*", destination: `${studio}/admin/:path*` },
      ],
      afterFiles: mediaOrigin()
        ? [{ source: "/media/:path*", destination: `${mediaOrigin()}/media/:path*` }]
        : [],
      fallback: [],
    };
  },
  async headers() {
    const viewportHints = {
      source: "/:path*",
      headers: [
        // Viewport Client Hints so SSR can emit only the mobile or desktop shell (not both).
        { key: "Accept-CH", value: "Sec-CH-UA-Mobile, Sec-CH-Viewport-Width" },
        { key: "Critical-CH", value: "Sec-CH-UA-Mobile, Sec-CH-Viewport-Width" },
        { key: "Vary", value: "Sec-CH-UA-Mobile, Sec-CH-Viewport-Width, Cookie" },
      ],
    };
    const brandRevalidate = [
      "/brand/icon-192.png",
      "/brand/icon-512.png",
      "/brand/icon-maskable-512.png",
      "/brand/apple-touch-icon.png",
      "/brand/apple-touch-icon-120.png",
      "/brand/apple-touch-icon-152.png",
      "/brand/apple-touch-icon-167.png",
      "/brand/favicon-16.png",
      "/brand/favicon-32.png",
      "/brand/newspoint-logo.webp",
      "/brand/newspoint-logo-dark.webp",
      "/brand/mark-emblem.webp",
      "/brand/push-badge.png",
      "/brand/splash-750x1334.png",
      "/brand/splash-750x1334-dark.png",
      "/brand/splash-1242x2688.png",
      "/brand/splash-1242x2688-dark.png",
      "/brand/splash-1170x2532.png",
      "/brand/splash-1170x2532-dark.png",
      "/brand/splash-1320x2868.png",
      "/brand/splash-1320x2868-dark.png",
      "/brand/splash-2048x2732.png",
      "/brand/splash-2048x2732-dark.png",
    ].flatMap((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
    }));
    const brandHashed = {
      source: "/brand/:file*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    };
    const workerCache = { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] };
    const fontCache = {
      source: "/fonts/:file*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    };
    // Catch-all first; explicit PWA/wordmark paths below override Cache-Control.
    return [viewportHints, ...indexingHeaderRules(), brandHashed, ...brandRevalidate, fontCache, workerCache];
  },
};

export default nextConfig;
