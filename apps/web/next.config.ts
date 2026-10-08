import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

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
  // Cloudflare quick tunnel (trycloudflare.com): without this, dev blocks /_next and client UI breaks.
  ...(process.env.NODE_ENV === "development"
    ? {
        allowedDevOrigins: ["localhost", "127.0.0.1", ".trycloudflare.com"],
      }
    : {}),
  // WordPress URLs end with a slash; imported paths are kept exactly (DEC-105).
  trailingSlash: true,
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
    // Local preview must never be indexed (DEC-111).
    const noindex = {
      source: "/:path*",
      headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        // Viewport Client Hints so SSR can emit only the mobile or desktop shell (not both).
        { key: "Accept-CH", value: "Sec-CH-UA-Mobile, Sec-CH-Viewport-Width" },
        { key: "Critical-CH", value: "Sec-CH-UA-Mobile, Sec-CH-Viewport-Width" },
        { key: "Vary", value: "Sec-CH-UA-Mobile, Sec-CH-Viewport-Width" },
      ],
    };
    // Brand art is content-hashed by scripts/build-studio-photo.mjs, so a year-long immutable
    // cache is safe. Without this header Next serves /public with max-age=0 and every page view
    // revalidates the background image.
    const brandCache = {
      source: "/brand/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    };
    const workerCache = { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] };
    return [noindex, brandCache, workerCache];
  },
};

export default nextConfig;
