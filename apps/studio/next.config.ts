import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const repoRoot = resolve(import.meta.dirname, "../..");
loadEnvConfig(repoRoot);

const studioDevOrigin = (process.env.STUDIO_URL ?? "http://localhost:3001").replace(/\/+$/, "");

const studioPublicUrl = (process.env.STUDIO_PUBLIC_URL ?? "http://localhost:3000/admin").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  ...(process.env.NP_DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),
  transpilePackages: ["@newspoint/db", "@newspoint/content"],
  turbopack: { root: repoRoot },
  env: {
    NEXT_PUBLIC_STUDIO_PUBLIC_URL: studioPublicUrl,
  },
  // Reached through the public host at /admin (apps/web rewrites); slashes match the web app.
  basePath: "/admin",
  trailingSlash: true,
  // Page at localhost:3000/admin is proxied from web; dev chunks and HMR must hit Studio directly.
  ...(process.env.NODE_ENV === "development"
    ? {
        assetPrefix: `${studioDevOrigin}/admin`,
        allowedDevOrigins: ["localhost", "127.0.0.1"],
      }
    : {}),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
