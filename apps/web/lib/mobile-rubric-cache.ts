import { mobileRubricFeedSchema, type MobileRubricFeed } from "./mobile-rubric-feed";

const MAX_BYTES = 512_000;
async function readBounded(response: Response): Promise<unknown> {
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json") || Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Feed unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Feed unavailable");
  const decoder = new TextDecoder(); let text = "", bytes = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error("Feed too large"); }
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}
/** Three public snapshots, two requests. Ownership lives in the mobile controller, never on the server. */
export class MobileRubricCache {
  private models = new Map<string, MobileRubricFeed>();
  private pending = new Map<string, { controller: AbortController; promise: Promise<MobileRubricFeed> }>();
  private allowed = new Set<string>();
  private menuVersion = "";
  constructor(private transport: typeof fetch = fetch) {}
  configure(paths: string[], menuVersion: string) {
    if (menuVersion !== this.menuVersion) this.clear();
    this.menuVersion = menuVersion; this.allowed = new Set(paths.slice(0, 3));
    for (const path of this.models.keys()) if (!this.allowed.has(path)) this.models.delete(path);
    for (const [path, request] of this.pending) if (!this.allowed.has(path)) { request.controller.abort(); this.pending.delete(path); }
  }
  seed(model: MobileRubricFeed) { if (this.allowed.has(model.canonicalPath) && model.menuVersion === this.menuVersion) this.models.set(model.canonicalPath, model); }
  get(path: string, now = Date.now()) { const value = this.models.get(path); return value && value.freshUntil > now ? value : undefined; }
  load(path: string): Promise<MobileRubricFeed> {
    if (!this.allowed.has(path)) return Promise.reject(new Error("Unsupported rubric"));
    const cached = this.get(path); if (cached) return Promise.resolve(cached);
    const pending = this.pending.get(path); if (pending) return pending.promise;
    if (this.pending.size >= 2) return Promise.reject(new Error("Request limit"));
    const controller = new AbortController(), version = this.menuVersion;
    const timer = setTimeout(() => controller.abort(), 8_000);
    // Native Window.fetch rejects a class instance as its receiver. Call the
    // transport as a function, preserving the same contract as direct fetch().
    const transport = this.transport;
    const promise = transport(`/api/mobile-rubric-feed/?path=${encodeURIComponent(path)}`, { signal: controller.signal, credentials: "omit" })
      .then(readBounded).then(value => {
        const model = mobileRubricFeedSchema.parse(value);
        if (controller.signal.aborted || this.menuVersion !== version || !this.allowed.has(path) || model.canonicalPath !== path || model.menuVersion !== version || model.freshUntil <= Date.now()) throw new Error("Stale feed");
        this.models.set(path, model); return model;
      }).finally(() => { clearTimeout(timer); if (this.pending.get(path)?.controller === controller) this.pending.delete(path); });
    this.pending.set(path, { controller, promise }); return promise;
  }
  invalidate() { this.models.clear(); }
  clear() { for (const request of this.pending.values()) request.controller.abort(); this.pending.clear(); this.models.clear(); }
  get size() { return this.models.size; }
  get inFlight() { return this.pending.size; }
}
