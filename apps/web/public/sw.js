/* Reader only. Private/editorial pages never enter this cache. */
const VERSION = "v4";
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
function brandHasContentHash(pathname) {
  const name = pathname.slice("/brand/".length);
  return /-[a-f0-9]{8}\.(webp|avif|jpe?g|png)$/i.test(name) || name.endsWith("-512w.webp");
}
async function trim(cache, max) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}
async function cacheFirstImmutable(cache, request) {
  let cached;
  try { cached = await cache.match(request); } catch { return fetch(request); }
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response) && /immutable/i.test(response.headers.get("cache-control") || "")) {
    await cache.put(request, response.clone()).then(() => trim(cache, 120)).catch(() => {});
  }
  return response;
}
async function staleWhileRevalidate(cache, request, event) {
  let cached;
  try { cached = await cache.match(request); } catch { cached = undefined; }
  const network = fetch(request).then(async (response) => {
    if (cacheable(response)) {
      await cache.put(request, response.clone()).then(() => trim(cache, 120)).catch(() => {});
    }
    return response;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  const response = await network;
  return response || fetch(request);
}
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const response = await fetch(OFFLINE, { credentials: "omit", cache: "reload" });
      if (response.ok && !response.redirected) await (await caches.open(OFFLINE_CACHE)).put(OFFLINE, response);
    } catch {}
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
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await (await caches.open(OFFLINE_CACHE)).match(OFFLINE)) || Response.error()));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      let cache;
      try { cache = await caches.open(ASSET_CACHE); } catch { return fetch(request); }
      return cacheFirstImmutable(cache, request);
    })());
    return;
  }
  if (url.pathname.startsWith("/brand/")) {
    event.respondWith((async () => {
      let cache;
      try { cache = await caches.open(ASSET_CACHE); } catch { return fetch(request); }
      if (brandHasContentHash(url.pathname)) return cacheFirstImmutable(cache, request);
      return staleWhileRevalidate(cache, request, event);
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
  return typeof value === "string" && value.trim() ? Array.from(value).slice(0, limit).join("") : fallback;
}
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch {}
  const source = payload && typeof payload === "object" && payload.web_push === 8030 ? payload.notification || {} : payload;
  const title = text(source?.title, "NewsPoint.bg", 160);
  const body = text(source?.body, "Нова публикация в NewsPoint.bg", 240);
  const url = readerUrl(source?.navigate || source?.url || source?.data?.url);
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
    let windows = [];
    try { windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true }); } catch {}
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
  event.waitUntil(self.clients.matchAll({ type: "window" }).then((clients) => {
    for (const client of clients) client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" });
  }));
});
