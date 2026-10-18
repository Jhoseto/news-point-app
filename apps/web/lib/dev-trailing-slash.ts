import type { NextConfig } from "next";

/** Keep Next's HTTP slash policy while letting development WebSockets reach Studio.
 * The built-in slash redirect hangs an upgrade to /admin/_next/hmr without a slash.
 * Production continues to use Next's unchanged built-in redirects.
 */
export function developmentSlashRedirects(): Awaited<ReturnType<NonNullable<NextConfig["redirects"]>>> {
  return [
    {
      source: "/:file((?!\\.well-known(?:/.*)?)(?:[^/]+/)*[^/]+\\.\\w+)/",
      destination: "/:file",
      permanent: true,
      missing: [{ type: "header", key: "x-nextjs-data" }, { type: "header", key: "upgrade" }],
    },
    {
      // The inner end assertion prevents Next's optional-slash route suffix
      // from matching an already canonical URL and redirecting it to itself.
      source: "/:notfile((?!\\.well-known(?:/.*)?)(?:[^/]+/)*[^/\\.]+$)",
      destination: "/:notfile/",
      permanent: true,
      missing: [{ type: "header", key: "upgrade" }],
    },
  ];
}
