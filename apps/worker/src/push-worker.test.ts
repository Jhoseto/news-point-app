import { readFileSync } from "node:fs";
import { createECDH, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@newspoint/db/schema";
import type { ScriptDb } from "@newspoint/db/node";
import { claimPushDeliveries, deliverPush, expandPushJob } from "./push-worker";

// Real PostgreSQL engine in WASM; no DATABASE_URL and no external network.
let pg: PGlite;
let db: ScriptDb;
const key = createECDH("prime256v1"); key.generateKeys();
const keys = { p256dh: key.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 7).toString("base64url") };
const category = randomUUID(), extraCategory = randomUUID();
const payload = { path: "/test-article/", title: "Explicit test article", topics: ["test-primary"] };
let article: string;
async function subscriber(slugs: string[] | null = null, enabled = true) {
  const [row] = await db.insert(schema.pushSubscriptions).values({ endpoint: `https://web.push.apple.com/test-${randomUUID()}`,
    ...keys, categorySlugs: slugs, enabled, enabledAt: new Date(Date.now() - 5000) }).returning();
  return row!;
}
async function publish() {
  const [row] = await db.insert(schema.outboxEvents).values({ type: "article.published", entityId: article, version: 1, payload }).returning();
  return row!;
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create table categories(id uuid primary key, slug text, name text, in_menu boolean default true);
    create table media_assets(id uuid primary key, storage_key text, mime text, width integer, height integer);
    create table media_presentations(media_asset_id uuid primary key, variants jsonb default '[]'::jsonb);
    create table articles(id uuid primary key, title text, excerpt text default '', path text, is_public boolean default true,
      published_at timestamptz default now(), primary_category_id uuid, hero_media_id uuid);
    create table article_categories(article_id uuid, category_id uuid);`);
  for (const file of ["06_outbox.sql", "25_push_subscriptions.sql", "26_push_category_slugs.sql", "27_push_delivery.sql"]) await pg.exec(readFileSync(`packages/db/migrations/${file}`, "utf8"));
  db = drizzle(pg, { schema }) as unknown as ScriptDb;
}, 30000);
beforeEach(async () => {
  await pg.exec("truncate push_jobs, push_subscriptions, outbox_events, article_categories, articles, media_presentations, media_assets, categories cascade");
  await pg.query("insert into categories values ($1, 'test-primary', 'Пловдив', true), ($2, 'test-secondary', 'Регион', true)", [category, extraCategory]);
  article = randomUUID();
  await pg.query("insert into articles(id,title,path,primary_category_id) values ($1,'Explicit test article','/test-article/',$2)", [article, category]);
  await pg.query("insert into article_categories values ($1,$2)", [article, extraCategory]);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await pg?.close(); });

describe("durable reader push", () => {
  it("rolls back push jobs with publication and creates none for edits", async () => {
    await expect(db.transaction(async (tx) => {
      await tx.insert(schema.outboxEvents).values({ type: "article.published", entityId: article, version: 1, payload });
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(await db.select().from(schema.pushJobs)).toHaveLength(0);
    await db.insert(schema.outboxEvents).values({ type: "article.updated", entityId: article, version: 2, payload });
    expect(await db.select().from(schema.pushJobs)).toHaveLength(0);
    await publish();
    expect(await db.select().from(schema.pushJobs)).toHaveLength(1);
  });
  it("fans out once and matches secondary rubrics, all and none", async () => {
    await subscriber(); await subscriber(["test-secondary"]); await subscriber([]); await subscriber(["unrelated"]); await subscriber(null, false);
    const late = await subscriber();
    await db.update(schema.pushSubscriptions).set({ enabledAt: new Date(Date.now() + 10000) }).where(eq(schema.pushSubscriptions.id, late.id));
    await publish();
    expect(await expandPushJob(db)).toBe(true);
    expect(await expandPushJob(db)).toBe(false);
    expect(await db.select().from(schema.pushDeliveries)).toHaveLength(2);
  });
  it("does not replay pre-launch jobs or send to devices subscribed with an older key", async () => {
    const before = await subscriber();
    const launchAt = new Date(Date.now() - 1000);
    await publish();
    await db.update(schema.pushJobs).set({ createdAt: new Date(launchAt.getTime() - 1000) });
    expect(await expandPushJob(db, launchAt)).toBe(true);
    expect(await db.select().from(schema.pushDeliveries)).toHaveLength(0);
    await publish();
    await expandPushJob(db, launchAt);
    expect(await db.select().from(schema.pushDeliveries)).toHaveLength(0);
    await db.update(schema.pushSubscriptions).set({ enabledAt: new Date() }).where(eq(schema.pushSubscriptions.id, before.id));
    await publish();
    await expandPushJob(db, launchAt);
    expect(await db.select().from(schema.pushDeliveries)).toHaveLength(1);
  });
  it("rechecks the launch boundary after a delivery has already been claimed", async () => {
    await subscriber(); await publish(); await expandPushJob(db);
    const [claimed] = await claimPushDeliveries(db);
    const send = vi.fn();
    await deliverPush(db, claimed!, "https://reader.test", send, new Date(Date.now() + 1000));
    expect(send).not.toHaveBeenCalled();
    expect((await db.select().from(schema.pushDeliveries))[0]?.status).toBe("skipped");
  });
  it("keeps committed jobs across a new worker and claims each delivery once", async () => {
    await subscriber(); await subscriber(); await publish();
    const restartedDb = drizzle(pg, { schema }) as unknown as ScriptDb;
    await expandPushJob(restartedDb);
    const claimed = await claimPushDeliveries(restartedDb);
    expect(claimed).toHaveLength(2);
    expect(await claimPushDeliveries(db)).toHaveLength(0);
  });
  it("recovers an expired lease and rejects the old worker's token", async () => {
    await subscriber(); await publish(); await expandPushJob(db);
    const [old] = await claimPushDeliveries(db);
    await db.update(schema.pushDeliveries).set({ leaseUntil: new Date(0) });
    const [fresh] = await claimPushDeliveries(db);
    expect(fresh!.leaseToken).not.toBe(old!.leaseToken);
    const send = vi.fn().mockResolvedValue({});
    await deliverPush(db, old!, "https://reader.test", send);
    expect(send).not.toHaveBeenCalled();
    await deliverPush(db, fresh!, "https://reader.test", send);
    expect(send).toHaveBeenCalledOnce();
  });
  it("rechecks opt-out and filters before send", async () => {
    const sub = await subscriber(); await publish(); await expandPushJob(db);
    const [claimed] = await claimPushDeliveries(db);
    await db.update(schema.pushSubscriptions).set({ enabled: false }).where(eq(schema.pushSubscriptions.id, sub.id));
    const send = vi.fn(); await deliverPush(db, claimed!, "https://reader.test", send);
    expect(send).not.toHaveBeenCalled();
    expect((await db.select().from(schema.pushDeliveries))[0]?.status).toBe("skipped");
  });
  it("never sends unpublished or historical imported articles", async () => {
    await subscriber(); await db.update(schema.articles).set({ publishedAt: new Date(0) }).where(eq(schema.articles.id, article));
    await publish(); await expandPushJob(db); expect(await db.select().from(schema.pushDeliveries)).toHaveLength(0);
  });
  it("records acceptance only after a successful provider response", async () => {
    const sub = await subscriber(); await publish(); await expandPushJob(db);
    const [claimed] = await claimPushDeliveries(db);
    const send = vi.fn().mockResolvedValue({}); await deliverPush(db, claimed!, "https://reader.test", send);
    const [delivery] = await db.select().from(schema.pushDeliveries);
    expect(delivery?.status).toBe("accepted"); expect(delivery?.acceptedAt).toBeInstanceOf(Date);
    expect((await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id)))[0]?.lastNotifiedAt).toBeInstanceOf(Date);
    expect(JSON.parse(send.mock.calls[0]![1]!).notification.navigate).toBe("https://reader.test/test-article/");
    expect(send.mock.calls[0]![2]).toMatchObject({ timeout: 15000 });
  });
  it("uses the real rubric, excerpt and locally hosted hero for a rich article notification", async () => {
    const hero = randomUUID();
    await pg.query("insert into media_assets values ($1, 'news/2026/10/story.webp', 'image/webp', 1600, 900)", [hero]);
    await pg.query("insert into media_presentations values ($1, $2::jsonb)", [hero,
      JSON.stringify([{ url: "/media/news/2026/10/story-640w.webp", width: 640, height: 360 }])]);
    await db.update(schema.articles).set({ excerpt: "<p>Реален текст &amp; подробности.</p>", heroMediaId: hero })
      .where(eq(schema.articles.id, article));
    await subscriber(["test-primary"]); await publish(); await expandPushJob(db);
    const [claimed] = await claimPushDeliveries(db);
    const send = vi.fn().mockResolvedValue({});
    await deliverPush(db, claimed!, "https://reader.test", send);
    const notification = JSON.parse(send.mock.calls[0]![1]!).notification;
    expect(notification.body).toBe("Пловдив · Реален текст & подробности.");
    expect(notification.image).toBe("https://reader.test/media/news/2026/10/story-640w.webp");
    expect(notification.icon).toBe("https://reader.test/brand/icon-192.png");
    expect(notification.badge).toBe("https://reader.test/brand/push-badge.png");
  });
  it("omits an unavailable or unsupported hero image", async () => {
    const hero = randomUUID();
    await pg.query("insert into media_assets values ($1, null, 'image/jpeg', 1600, 900)", [hero]);
    await db.update(schema.articles).set({ heroMediaId: hero }).where(eq(schema.articles.id, article));
    await subscriber(); await publish(); await expandPushJob(db);
    const [claimed] = await claimPushDeliveries(db);
    const send = vi.fn().mockResolvedValue({});
    await deliverPush(db, claimed!, "https://reader.test", send);
    expect(JSON.parse(send.mock.calls[0]![1]!).notification).not.toHaveProperty("image");
  });
  it("persists transient retries and does not report them as accepted", async () => {
    const sub = await subscriber(); await publish(); await expandPushJob(db);
    const [claimed] = await claimPushDeliveries(db);
    const send = vi.fn().mockRejectedValue({ statusCode: 429, headers: { "retry-after": "60" } });
    await deliverPush(db, claimed!, "https://reader.test", send);
    const [delivery] = await db.select().from(schema.pushDeliveries);
    expect(delivery?.status).toBe("pending"); expect(delivery!.dueAt.getTime()).toBeGreaterThan(Date.now() + 59000);
    expect((await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id)))[0]?.lastNotifiedAt).toBeNull();
  });
  it("does not send oversized canonical URLs or retry a permanent payload limit", async () => {
    await subscriber(); await db.update(schema.articles).set({ path: "/" + "long".repeat(1500) + "/" }).where(eq(schema.articles.id, article));
    await publish(); await expandPushJob(db); const [claimed] = await claimPushDeliveries(db);
    const send = vi.fn(); await deliverPush(db, claimed!, "https://reader.test", send);
    expect(send).not.toHaveBeenCalled();
    expect((await db.select().from(schema.pushDeliveries))[0]).toMatchObject({ status: "failed", errorCode: "payload_too_large" });
  });
  it("removes expired endpoints without retry", async () => {
    await subscriber(); await publish(); await expandPushJob(db);
    const [claimed] = await claimPushDeliveries(db);
    await deliverPush(db, claimed!, "https://reader.test", vi.fn().mockRejectedValue({ statusCode: 410 }));
    expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(0);
    expect(await db.select().from(schema.pushDeliveries)).toHaveLength(0);
  });
  it("test notification targets exactly its own enabled device", async () => {
    const own = await subscriber(); await subscriber();
    await db.insert(schema.pushJobs).values({ kind: "test", subscriptionId: own.id });
    await expandPushJob(db); const [delivery] = await claimPushDeliveries(db);
    expect(delivery!.subscriptionId).toBe(own.id);
    const send = vi.fn().mockResolvedValue({}); await deliverPush(db, delivery!, "https://reader.test", send);
    expect(JSON.parse(send.mock.calls[0]![1]!).notification.title).toContain("тестово");
    expect(await claimPushDeliveries(db)).toHaveLength(0);
  });
  it("migration rerun leaves completed deliveries and does not replay outbox", async () => {
    await subscriber(); await publish(); await expandPushJob(db);
    const [claimed] = await claimPushDeliveries(db);
    await deliverPush(db, claimed!, "https://reader.test", vi.fn().mockResolvedValue({}));
    await pg.exec(readFileSync("packages/db/migrations/27_push_delivery.sql", "utf8"));
    expect(await claimPushDeliveries(db)).toHaveLength(0);
    expect(await db.select().from(schema.pushJobs)).toHaveLength(1);
  });
});
