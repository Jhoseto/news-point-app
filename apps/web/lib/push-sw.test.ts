import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const self = { location: { origin: "https://reader.test" }, addEventListener: (key: string, handler: any) => { handlers[key] = handler; },
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) }, skipWaiting: vi.fn(),
    clients: { matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn().mockResolvedValue(null), claim: vi.fn() } };
  const cache = { put: vi.fn(), match: vi.fn(), keys: vi.fn().mockResolvedValue([]), delete: vi.fn() };
  const caches = { keys: vi.fn().mockResolvedValue([]), delete: vi.fn(), open: vi.fn().mockResolvedValue(cache) };
  const fetch = vi.fn().mockResolvedValue(new Response("network", { headers: { "cache-control": "private, no-store" } }));
  runInNewContext(readFileSync("apps/web/public/sw.js", "utf8"), { self, caches, fetch, URL, Response });
  async function fire(name: string, data: object = {}) {
    const waits: Promise<unknown>[] = [];
    const respond = vi.fn((promise) => { waits.push(promise); });
    handlers[name]!({ ...data, waitUntil: (promise: Promise<unknown>) => waits.push(promise), respondWith: respond });
    await Promise.all(waits);
    return respond;
  }
  return { self, caches, cache, fetch, fire };
}
describe("reader service worker", () => {
  it.each([null, { title: "legacy", url: "/article/", tag: "same" }, { web_push: 8030, notification: { title: "declarative", navigate: "/article/" } }, { title: 42, url: "javascript:alert(1)" }])("always displays a visible notification for %j", async (payload) => {
    const w = worker(); await w.fire("push", { data: { json: () => payload } });
    expect(w.self.registration.showNotification).toHaveBeenCalledOnce();
    const [title, options] = w.self.registration.showNotification.mock.calls[0]!;
    expect(typeof title).toBe("string"); expect(options.data.url).toMatch(/^https:\/\/reader.test\//);
  });
  it("malformed JSON cannot suppress display", async () => {
    const w = worker(); await w.fire("push", { data: { json: () => { throw new Error("bad"); } } });
    expect(w.self.registration.showNotification).toHaveBeenCalledOnce();
  });
  it("failed navigation opens a new reader window and leaves Studio alone", async () => {
    const w = worker(); const navigate = vi.fn().mockRejectedValue(new Error("closed"));
    const studio = { url: "https://reader.test/admin/", navigate: vi.fn(), focus: vi.fn() };
    w.self.clients.matchAll.mockResolvedValue([studio, { url: "https://reader.test/", navigate, focus: vi.fn() }]);
    await w.fire("notificationclick", { notification: { close: vi.fn(), data: { url: "/article/" } } });
    expect(studio.navigate).not.toHaveBeenCalled(); expect(w.self.clients.openWindow).toHaveBeenCalledWith("https://reader.test/article/");
  });
  it("focuses the exact article rather than navigating another reader", async () => {
    const w = worker(); const focus = vi.fn().mockResolvedValue(undefined), navigate = vi.fn();
    w.self.clients.matchAll.mockResolvedValue([{ url: "https://reader.test/", navigate }, { url: "https://reader.test/article/", focus }]);
    await w.fire("notificationclick", { notification: { close: vi.fn(), data: { url: "/article/" } } });
    expect(focus).toHaveBeenCalledOnce(); expect(navigate).not.toHaveBeenCalled(); expect(w.self.clients.openWindow).not.toHaveBeenCalled();
  });
  it("unavailable window inventory still falls back to openWindow", async () => {
    const w = worker(); w.self.clients.matchAll.mockRejectedValue(new Error());
    await w.fire("notificationclick", { notification: { close: vi.fn(), data: { url: "https://evil.test/" } } });
    expect(w.self.clients.openWindow).toHaveBeenCalledWith("https://reader.test/");
  });
  it.each(["/admin/", "/api/push/subscribe/", "/settings/"])("does not intercept private path %s", async (path) => {
    const w = worker(); const response = await w.fire("fetch", { request: { method: "GET", url: `https://reader.test${path}`, mode: "navigate" } });
    expect(response).not.toHaveBeenCalled(); expect(w.caches.open).not.toHaveBeenCalled();
  });
  it("does not cache HTML or private assets and tolerates broken CacheStorage", async () => {
    const w = worker(); await w.fire("fetch", { request: { method: "GET", url: "https://reader.test/article/", mode: "navigate" } });
    expect(w.cache.put).not.toHaveBeenCalled();
    await w.fire("fetch", { request: { method: "GET", url: "https://reader.test/brand/icon.png", mode: "cors" } });
    expect(w.cache.put).not.toHaveBeenCalled();
    w.caches.open.mockRejectedValue(new Error("quota"));
    await w.fire("fetch", { request: { method: "GET", url: "https://reader.test/brand/icon.png", mode: "cors" } });
    expect(w.fetch).toHaveBeenCalledTimes(3);
  });
  it("deletes only old reader caches and updates only when explicitly requested", async () => {
    const w = worker(); w.caches.keys.mockResolvedValue(["reader-pages-v1", "reader-assets-v1", "studio-assets-v1", "other-app", "reader-assets-v2"]);
    await w.fire("activate"); expect(w.caches.delete.mock.calls.map((call) => call[0])).toEqual(["reader-pages-v1", "reader-assets-v1"]);
    await w.fire("install"); expect(w.self.skipWaiting).not.toHaveBeenCalled();
    await w.fire("message", { data: { type: "SKIP_WAITING" } }); expect(w.self.skipWaiting).toHaveBeenCalledOnce();
  });
});
