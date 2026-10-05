import { createECDH } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const key = createECDH("prime256v1"); key.generateKeys();
const publicKey = key.getPublicKey().toString("base64url");
let storage: Map<string, string>;
let sub: { options: { applicationServerKey: ArrayBuffer }; toJSON: () => object; unsubscribe: ReturnType<typeof vi.fn> };
let registration: { pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> } };
let permission: { permission: string; requestPermission: ReturnType<typeof vi.fn> };
let fakeWindow: Record<string, unknown>;
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  storage = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  sub = { options: { applicationServerKey: new Uint8Array(key.getPublicKey()).buffer as ArrayBuffer },
    toJSON: () => ({ endpoint: "https://web.push.apple.com/explicit-test", keys: { p256dh: publicKey, auth: "explicit-test-only-auth" } }), unsubscribe: vi.fn().mockResolvedValue(true) };
  registration = { pushManager: { getSubscription: vi.fn().mockResolvedValue(sub), subscribe: vi.fn().mockResolvedValue(sub) } };
  permission = { permission: "granted", requestPermission: vi.fn().mockResolvedValue("granted") };
  fakeWindow = { isSecureContext: true, PushManager: {}, Notification: permission, atob, dispatchEvent: vi.fn(), matchMedia: vi.fn().mockReturnValue({ matches: true }) };
  vi.stubGlobal("window", fakeWindow); vi.stubGlobal("Notification", permission);
  vi.stubGlobal("navigator", { platform: "iPhone", maxTouchPoints: 5, userAgent: "iPhone CriOS", language: "bg",
    serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration), register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration) } });
  fetcher = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("vapid")) return Response.json({ publicKey });
    const body = JSON.parse(String(init?.body));
    return Response.json({ state: { revision: body.action === "status" ? 3 : 4, enabled: body.action !== "disable", categorySlugs: body.categorySlugs ?? null } });
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("push browser lifecycle", () => {
  it("shows install guidance on iOS even before push APIs are exposed", async () => {
    delete fakeWindow.PushManager; delete fakeWindow.Notification;
    fakeWindow.matchMedia = () => ({ matches: false });
    expect((await import("./push-client")).readPushSupport()).toMatchObject({ needInstall: true, supported: false });
  });
  it("accepts installed iOS apps without requiring Safari's user agent", async () => {
    expect((await import("./push-client")).readPushSupport()).toMatchObject({ ios: true, installed: true, supported: true, needInstall: false });
  });
  it("recognizes iPad using desktop UA", async () => {
    Object.assign(navigator, { platform: "MacIntel", userAgent: "Macintosh Safari", maxTouchPoints: 5 });
    fakeWindow.matchMedia = () => ({ matches: false });
    expect((await import("./push-client")).readPushSupport().needInstall).toBe(true);
  });
  it("does not wait forever for an unregistered worker", async () => {
    vi.mocked(navigator.serviceWorker.getRegistration).mockResolvedValue(undefined);
    expect(await (await import("./push-client")).getBrowserPushSubscription()).toBeNull();
  });
  it("recovers a declarative subscription if the service worker was removed", async () => {
    vi.mocked(navigator.serviceWorker.getRegistration).mockResolvedValue(undefined);
    fakeWindow.pushManager = registration.pushManager;
    expect(await (await import("./push-client")).getBrowserPushSubscription()).toBe(sub);
  });
  it("retries a pending explicit opt-out on resume without subscribing", async () => {
    const client = await import("./push-client");
    fetcher.mockResolvedValue(Response.json({ error: "unavailable" }, { status: 503 }));
    await expect(client.mutatePush("disable", 3)).rejects.toMatchObject({ code: "unavailable" });
    expect(storage.get("np-push-disable-pending")).toBe("1");
    fetcher.mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return Response.json({ state: { enabled: body.action !== "disable", revision: 4, categorySlugs: [] } });
    });
    expect((await client.readPushServerState())?.enabled).toBe(false);
    expect(storage.get("np-push-disable-pending")).toBe("0");
    expect(fetcher.mock.calls.every((call) => JSON.parse(String(call[1]?.body)).action !== "subscribe")).toBe(true);
  });
  it("requests permission synchronously before any network await", async () => {
    permission.permission = "default";
    const client = await import("./push-client");
    const result = client.subscribeForPush({ categorySlugs: [] });
    expect(permission.requestPermission).toHaveBeenCalledOnce(); expect(fetcher).not.toHaveBeenCalled();
    expect(await result).toMatchObject({ ok: true });
    const bodies = fetcher.mock.calls.filter((row) => row[1]?.body).map((row) => JSON.parse(row[1].body));
    expect(bodies.at(-1)).toMatchObject({ action: "subscribe", categorySlugs: [], revision: 3 });
  });
  it("does not claim activation when server registration fails", async () => {
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("vapid")) return Response.json({ publicKey });
      return JSON.parse(String(init?.body)).action === "status" ? Response.json({ state: null }) : Response.json({ error: "unavailable" }, { status: 503 });
    });
    expect(await (await import("./push-client")).subscribeForPush()).toEqual({ ok: false, reason: "unavailable" });
    expect(storage.get("np-push-master")).not.toBe("1");
  });
  it("rubric changes never carry an enable action", async () => {
    const client = await import("./push-client"); await client.mutatePush("preferences", 3, []);
    const body = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(body.action).toBe("preferences"); expect(body.enabled).toBeUndefined(); expect(body.categorySlugs).toEqual([]);
  });
  it("server opt-out wins over stale local preferences", async () => {
    storage.set("np-push-master", "1");
    fetcher.mockResolvedValue(Response.json({ state: { enabled: false, revision: 5, categorySlugs: [] } }));
    expect((await (await import("./push-client")).readPushServerState())?.enabled).toBe(false);
    expect(storage.get("np-push-master")).toBe("0");
  });
  it("serializes mutations and avoids concurrent network writes", async () => {
    const client = await import("./push-client"); let concurrent = 0, max = 0;
    fetcher.mockImplementation(async () => { concurrent++; max = Math.max(max, concurrent); await Promise.resolve(); concurrent--; return Response.json({ state: { enabled: false, revision: 5, categorySlugs: [] } }); });
    await Promise.all([client.mutatePush("disable", 3), client.mutatePush("preferences", 4, [])]);
    expect(max).toBe(1);
  });
  it("bounds service-worker readiness and catches permission API exceptions", async () => {
    const client = await import("./push-client"); permission.permission = "default"; permission.requestPermission.mockImplementation(() => { throw new Error("OS failure"); });
    expect(await client.subscribeForPush()).toMatchObject({ ok: false });
    vi.useFakeTimers(); Object.assign(navigator.serviceWorker, { ready: new Promise(() => {}) });
    const promise = client.ensureReaderServiceWorker();
    const assertion = expect(promise).rejects.toMatchObject({ code: "worker" });
    await vi.advanceTimersByTimeAsync(8001); await assertion;
  });
  it("stops server delivery before browser unsubscribe and preserves preferences", async () => {
    const events: string[] = [];
    fetcher.mockImplementation(async (_url, init) => { const body = JSON.parse(String(init?.body)); events.push(body.action); return Response.json({ state: body.action === "unsubscribe" ? null : { enabled: true, revision: 3, categorySlugs: ["plovdiv"] } }); });
    sub.unsubscribe.mockImplementation(async () => { events.push("browser-unsubscribe"); return true; });
    await (await import("./push-client")).unsubscribePush();
    expect(events).toEqual(["status", "unsubscribe", "browser-unsubscribe"]);
  });
});
