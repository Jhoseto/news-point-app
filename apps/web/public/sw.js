/* Reader PWA service worker.
 *
 * Strategy:
 * - HTML pages: network-first with offline fallback to last cached version.
 *   The reader is content-driven so we do not cache personalized responses.
 * - Next.js hashed assets (/_next/static/...): cache-first, immutable.
 * - Brand and image files in /brand: cache-first with background revalidation.
 * - /api/*, /feed/, /sitemap.xml: never cached.
 *
 * No background sync, no push — those are added later under MOBILE_PLAN.md.
 */
/* eslint-disable no-restricted-globals */

const VERSION = "v1";
const RUNTIME_CACHE = `reader-runtime-${VERSION}`;
const ASSET_CACHE = `reader-assets-${VERSION}`;
const PAGE_CACHE = `reader-pages-${VERSION}`;

const PRECACHE_URLS = ["/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { credentials: "same-origin" });
            if (response.ok) await cache.put(url, response);
          } catch {
            // offline on first install: skip
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => ![RUNTIME_CACHE, ASSET_CACHE, PAGE_CACHE].includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAssetRequest(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/");
}

function isHtmlRequest(request) {
  return request.mode === "navigate" || (request.method === "GET" && request.headers.get("accept")?.includes("text/html"));
}

function isCacheableResponse(response) {
  return response && response.status === 200 && response.type !== "opaque" && response.type !== "opaqueredirect";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/feed/" || url.pathname === "/sitemap.xml") return;

  if (isAssetRequest(url)) {
    // Cache-first for hashed/static assets.
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (isCacheableResponse(response)) cache.put(request, response.clone());
          return response;
        } catch {
          return cached ?? Response.error();
        }
      }),
    );
    return;
  }

  if (isHtmlRequest(request)) {
    // Network-first for HTML pages.
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (isCacheableResponse(response)) {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match("/offline");
          return offline ?? Response.error();
        }
      })(),
    );
    return;
  }
});