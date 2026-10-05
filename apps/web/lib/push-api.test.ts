import { createECDH, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@newspoint/db/schema";
import type { ScriptDb } from "@newspoint/db/node";

vi.mock("server-only", () => ({}));
vi.mock("@newspoint/db", async () => ({ ...(await vi.importActual<object>("@newspoint/db")), getDb: () => db }));
import { handlePushRequest, pushRequestAllowed } from "./push-api";
import { DELETE } from "../app/api/push/subscribe/route";
import { GET } from "../app/api/push/vapid/route";

let pg: PGlite, db: ScriptDb;
const key = createECDH("prime256v1"); key.generateKeys();
const proof = { endpoint: "https://web.push.apple.com/explicit-test", keys: {
  p256dh: key.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 9).toString("base64url"),
} };
function request(body: unknown, origin = "http://localhost", headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/push/subscribe/", { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
function act(action: string, extra: object = {}) { return handlePushRequest(request({ ...proof, action, ...extra })); }
async function subscribe() { const res = await act("subscribe"); expect(res.status).toBe(201); return (await res.json()).state as { revision: number }; }
beforeAll(async () => {
  vi.stubEnv("WEB_URL", "http://localhost");
  vi.stubEnv("VAPID_PUBLIC_KEY", key.getPublicKey().toString("base64url"));
  vi.stubEnv("VAPID_PRIVATE_KEY", key.getPrivateKey().toString("base64url"));
  pg = new PGlite();
  await pg.exec("create table categories (id uuid primary key default gen_random_uuid(),slug text,in_menu boolean); create table articles(id uuid primary key);");
  for (const file of ["06_outbox.sql", "25_push_subscriptions.sql", "26_push_category_slugs.sql", "27_push_delivery.sql"]) await pg.exec(readFileSync(`packages/db/migrations/${file}`, "utf8"));
  await pg.exec("insert into categories(slug,in_menu) values ('test-primary',true),('not-in-menu',false)");
  db = drizzle(pg, { schema }) as unknown as ScriptDb;
}, 30000);
beforeEach(async () => { await pg.exec("truncate push_jobs,push_subscriptions,push_rate_limits cascade"); });
afterAll(async () => { vi.unstubAllEnvs(); await pg?.close(); });

describe("device push API", () => {
  it("rejects a correctly sized key that is not on the P-256 curve", async () => {
    const invalid = Buffer.alloc(65); invalid[0] = 4;
    const res = await handlePushRequest(request({ ...proof, keys: { ...proof.keys, p256dh: invalid.toString("base64url") }, action: "subscribe" }));
    expect(res.status).toBe(400); expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(0);
  });
  it("status is private and never creates/enables a subscription", async () => {
    const res = await act("status");
    expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toContain("no-store");
    expect((await res.json()).state).toBeNull(); expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(0);
  });
  it("requires matching browser encryption keys for every device action", async () => {
    await subscribe();
    for (const action of ["status", "disable", "preferences", "test", "unsubscribe", "subscribe"]) {
      const res = await handlePushRequest(request({ ...proof, keys: { ...proof.keys, auth: Buffer.alloc(16, 8).toString("base64url") }, action, revision: 1, categorySlugs: [] }));
      expect(res.status).toBe(403);
    }
    expect((await db.select().from(schema.pushSubscriptions))[0]?.enabled).toBe(true);
  });
  it("rejects endpoint-only deletion and cross-origin requests", async () => {
    expect(DELETE().status).toBe(405);
    expect(pushRequestAllowed(request(proof, "https://evil.test"))).toBe(false);
    expect((await handlePushRequest(request(proof, "https://evil.test"))).status).toBe(403);
    expect((await handlePushRequest(request(proof, "http://localhost", { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  });
  it("does not silently overwrite preferences or opt-out on stale revision", async () => {
    const { revision } = await subscribe();
    expect((await act("disable", { revision })).status).toBe(200);
    const stale = await act("subscribe", { revision }); expect(stale.status).toBe(409);
    expect((await stale.json()).state.enabled).toBe(false);
    const saved = await act("preferences", { revision: revision + 1, categorySlugs: ["test-primary"] });
    expect(saved.status).toBe(200); expect((await saved.json()).state).toMatchObject({ enabled: false, categorySlugs: ["test-primary"] });
  });
  it("CAS accepts only one write from competing views", async () => {
    await subscribe();
    const results = await Promise.all([act("preferences", { revision: 1, categorySlugs: [] }), act("preferences", { revision: 1, categorySlugs: null })]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
  });
  it("explicit opt-out wins over a simultaneous preferences save", async () => {
    await subscribe();
    await Promise.all([act("preferences", { revision: 1, categorySlugs: [] }), act("disable", { revision: 1 })]);
    expect((await (await act("status")).json()).state.enabled).toBe(false);
  });
  it("keeps empty selection distinct from all and validates menu rubrics", async () => {
    await subscribe();
    const empty = await act("preferences", { revision: 1, categorySlugs: [] }); expect((await empty.json()).state.categorySlugs).toEqual([]);
    expect((await act("preferences", { revision: 2, categorySlugs: ["not-in-menu"] })).status).toBe(400);
    const all = await act("preferences", { revision: 2, categorySlugs: null }); expect((await all.json()).state.categorySlugs).toBeNull();
  });
  it("limits test notifications to the owned enabled device and one per minute", async () => {
    await subscribe();
    expect((await act("test")).status).toBe(202);
    expect((await act("test")).status).toBe(429);
    const [job] = await db.select().from(schema.pushJobs); const [sub] = await db.select().from(schema.pushSubscriptions);
    expect(job?.subscriptionId).toBe(sub?.id); expect(job?.kind).toBe("test");
    await act("disable", { revision: 1 }); expect((await act("test")).status).toBe(409);
  });
  it("returns canonical legacy filters and never changes them on read", async () => {
    await subscribe(); await db.update(schema.pushSubscriptions).set({ categorySlug: "test-primary", categorySlugs: null });
    expect((await (await act("status")).json()).state.categorySlugs).toEqual(["test-primary"]);
  });
  it("rejects bad keys and oversized input without touching subscriptions", async () => {
    expect((await handlePushRequest(request({ ...proof, keys: { auth: "bad", p256dh: "bad" } }))).status).toBe(400);
    expect((await handlePushRequest(request(proof, "http://localhost", { "content-length": "9000" }))).status).toBe(400);
    expect((await handlePushRequest(request({ ...proof, userAgent: "x".repeat(10000) }))).status).toBe(400);
    expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(0);
  });
  it("enforces a shared rate limit without keeping raw endpoints", async () => {
    const bucket = createHash("sha256").update(`reader-push-device:${proof.endpoint}`).digest("hex");
    await db.insert(schema.pushRateLimits).values({ bucket, hits: 60 });
    const res = await act("status"); expect(res.status).toBe(429); expect(res.headers.get("retry-after")).toBe("60");
    expect((await db.select().from(schema.pushRateLimits)).every((row) => !row.bucket.includes("http"))).toBe(true);
  });
  it("delete requires a current revision and cancels queued test jobs", async () => {
    await subscribe(); await act("test");
    expect((await act("unsubscribe", { revision: 1 })).status).toBe(200);
    expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(0);
    expect(await db.select().from(schema.pushJobs)).toHaveLength(0);
  });
  it("preflights migrations and configuration without publishing the private key", async () => {
    const res = await GET(); expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ publicKey: key.getPublicKey().toString("base64url") });
    expect(res.headers.get("cache-control")).toContain("no-store");
    await pg.exec("alter table push_subscriptions rename column enabled_at to missing_enabled_at");
    expect((await GET()).status).toBe(503);
    await pg.exec("alter table push_subscriptions rename column missing_enabled_at to enabled_at");
  });
});
