import type { NextConfig } from "next";

/** Exact WordPress pages whose replacement was verified against archived links/content. */
export function legacyStaticRedirects(): Awaited<ReturnType<NonNullable<NextConfig["redirects"]>>> {
  return [
    { source: "/za-nas/", destination: "/team/", statusCode: 301 },
    { source: "/ekip/", destination: "/team/", statusCode: 301 },
    { source: "/contacts/reklama/", destination: "/advertising/", statusCode: 301 },
    { source: "/izprati-novina/", destination: "/livepoint/my-news/", statusCode: 301 },
  ];
}
