/* Reader only. Private/editorial pages never enter this cache. */
const VERSION = "v2";
const ASSET_CACHE = `reader-assets-${VERSION}`;
const OFFLINE_CACHE = `reader-runtime-${VERSION}`;
const OWN_PREFIXES = ["reader-assets-", "reader-runtime-", "reader-pages-"];
const OFFLINE = "/offline/";

function privatePath(path) { return /^\/(admin|api|settings)(\/|$)/.test(path); }
function cacheable(response) {
  const policy = response.headers.get("cache-control") || "";
  return response.ok && response.status === 200 && !response.redirected
    && response.type !== "opaque" && !/private|no-store/i.test(policy)
    && !response.headers.has("set-cookie");
}
async function trim(cache, max) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      // Fixed static offline screen fetched without reader/staff credentials.
      const response = await fetch(OFFLINE, { credentials: "omit", cache: "reload" });
      if (response.ok && !response.redirected) await (await caches.open(OFFLINE_CACHE)).put(OFFLINE, response);
    } catch {}
    // First install activates naturally. Updates wait until the app is hidden.
  })());
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => OWN_PREFIXES.some((prefix) => key.startsWith(prefix))
      && ![ASSET_CACHE, OFFLINE_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || privatePath(url.pathname)) return;
  // No HTML page cache: a public response today can become private tomorrow.
  // Offline fallback is only the fixed reader screen, never a cached article.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await (await caches.open(OFFLINE_CACHE)).match(OFFLINE)) || Response.error()));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/")) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      // Cache failures cannot turn a successful network response into an error.
      if (cacheable(response) && /immutable/i.test(response.headers.get("cache-control") || "")) {
        event.waitUntil(cache.put(request, response.clone()).then(() => trim(cache, 120)).catch(() => {}));
      }
      return response;
    })());
  }
});

function readerUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/", self.location.origin);
    if (url.origin === self.location.origin && !url.username && !url.password && !privatePath(url.pathname)) return url.href;
  } catch {}
  return self.location.origin + "/";
}
function text(value, fallback, limit) {
  return typeof value === "string" && value.trim() ? value.slice(0, limit) : fallback;
}
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch {}
  const source = payload && typeof payload === "object" && payload.web_push === 8030 ? payload.notification || {} : payload;
  const title = text(source?.title, "NewsPoint.bg", 160);
  const body = text(source?.body, "Нова публикация в NewsPoint.bg", 240);
  const url = readerUrl(source?.navigate || source?.url || source?.data?.url);
  // The OS replaces an existing notification with the same tag. No asynchronous
  // getNotifications dependency can prevent this mandatory visible notification.
  event.waitUntil(self.registration.showNotification(title, {
    body, tag: text(source?.tag, "np-reader-news", 200), lang: "bg",
    icon: "/brand/icon-192.png", badge: "/brand/push-badge.png", data: { url },
    requireInteraction: false, renotify: false,
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = readerUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const readers = windows.filter((client) => {
      try { const current = new URL(client.url); return current.origin === self.location.origin && !privatePath(current.pathname); } catch { return false; }
    }).sort((a, b) => Number(b.url === url) - Number(a.url === url));
    for (const client of readers) {
      try {
        if (client.url === url) { await client.focus(); return; }
        const navigated = await client.navigate(url);
        if (navigated) { await navigated.focus(); return; }
      } catch { /* try another reader, then a new app window */ }
    }
    await self.clients.openWindow(url);
  })());
});
self.addEventListener("pushsubscriptionchange", (event) => {
  // Reconcile in a visible app; never restore an opt-out in the background.
  event.waitUntil(self.clients.matchAll({ type: "window" }).then((clients) => {
    for (const client of clients) client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" });
  }));
});
