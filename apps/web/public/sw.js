/* Reader PWA service worker.
 *
 * Strategy:
 * - HTML pages: network-first with offline fallback to last cached version.
 *   The reader is content-driven so we do not cache personalized responses.
 * - Next.js hashed assets (/_next/static/...): cache-first, immutable.
 * - Brand and image files in /brand: cache-first with background revalidation.
 * - /api/*, /feed/, /sitemap.xml: never cached.
 *
 * Push notifications land here when the server sends `article.published`.
 * Tapping a notification focuses an existing tab and navigates it to the
 * article, or opens a new tab when none exists.
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

/**
 * Push notifications: open the article in the existing tab when possible,
 * otherwise spawn a new one. Keep the payload small — it's shown as-is.
 */
const DEFAULT_NOTIFICATION_TAG = "np-new-article";

self.addEventListener("push", (event) => {
  let payload = {
    title: "NewsPoint.bg",
    body: "Нова публикация",
    url: "/",
    tag: DEFAULT_NOTIFICATION_TAG,
  };
  try {
    if (event.data) payload = { ...payload, ...JSON.parse(event.data.text()) };
  } catch {
    // ignore malformed payload
  }
  event.waitUntil(
    (async () => {
      // Only collapse notifications from the reader PWA — leave any unrelated
      // notifications (e.g. LivePoint indicator pings) alone.
      const all = await self.registration.getNotifications({ tag: payload.tag });
      for (const note of all) note.close();
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        icon: "/brand/icon-192.png",
        badge: "/brand/icon-maskable-512.png",
        data: { url: payload.url },
        requireInteraction: false,
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          try {
            await client.navigate(url);
          } catch {}
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

self.addEventListener("notificationclose", (event) => {
  // Could be wired to analytics in the future. Today: nothing to clean up;
  // the server already tracks `lastNotifiedAt`.
  event.waitUntil(Promise.resolve());
});