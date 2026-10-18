import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@newspoint/db/schema";
import type { ScriptDb } from "@newspoint/db/node";
import { breakingInputSchema, breakingVisibleAt } from "../packages/content/src/breaking";
import { breakingReady, readBreakingSettings, readPublicBreaking, writeBreaking } from "../packages/db/src/breaking";

let pg: PGlite, db: ScriptDb;
const articleId = randomUUID();
const input = (version = 0) => ({ expectedVersion: version, enabled: true, text: "Изрична изолирана тестова фикстура.", articleId: null as string | null });
beforeAll(async () => {
  pg = new PGlite(); const embedded = drizzle(pg, { schema });
  // Match postgres-js execute's row-array contract for the readiness probe.
  const adapt = (executor: { execute: (...args: never[]) => unknown }) => {
    const original = executor.execute.bind(executor);
    executor.execute = ((...args: never[]) => Promise.resolve(original(...args)).then(result => (result as { rows?: unknown }).rows ?? result)) as typeof executor.execute;
  };
  adapt(embedded as never); const transaction = embedded.transaction.bind(embedded);
  embedded.transaction = ((cb: (tx: unknown) => unknown) => transaction(async tx => { adapt(tx as never); return cb(tx); })) as typeof embedded.transaction;
  db = embedded as unknown as ScriptDb;
  const included = new Set([1,2,3,4,5,6,7,8,9,12,13,17,18,19,20,21,24,25,26,27,30,38,39]);
  for (const file of readdirSync("packages/db/migrations").sort()) if (included.has(Number(file.slice(0,2)))) await pg.exec(readFileSync(`packages/db/migrations/${file}`, "utf8"));
  expect(await breakingReady(db)).toBe(false);
  expect(await readPublicBreaking(db)).toBeNull();
  expect((await readBreakingSettings(db)).ready).toBe(false);
  await expect(writeBreaking(db, input(), "breaking-editor")).rejects.toMatchObject({ code: "not_ready" });
  await pg.exec(readFileSync("packages/db/migrations/40_breaking_bulletins.sql", "utf8"));
  await db.insert(schema.staffUsers).values({ id: "breaking-editor", name: "Explicit QA editor", email: "breaking@example.invalid", role: "editor" });
  await db.insert(schema.articles).values({ id: articleId, sourceSystem: "studio", title: "Explicit QA article", slug: "breaking-fixture", path: "/breaking-fixture/", isPublic: true, publishedAt: new Date("2026-01-01") });
}, 30000);
beforeEach(async () => {
  await db.delete(schema.breakingBulletins); await db.delete(schema.outboxEvents);
  await db.update(schema.articles).set({ isPublic: true, publishedAt: new Date("2026-01-01") }).where(eq(schema.articles.id, articleId));
});
afterAll(async () => { await pg?.close(); });

describe("breaking-message validation", () => {
  it("includes only home, known rubrics and their archive pages", () => {
    const paths = ["/plovdiv/", "/sportni-novini/"];
    for (const path of ["/", "/plovdiv/", "/sportni-novini", "/plovdiv/archive/cursor/"]) expect(breakingVisibleAt(path, paths)).toBe(true);
    for (const path of ["/breaking-fixture/", "/plovdiv/article/", "/search/", "/contacts/", "/plovdiv/archive/cursor/extra/"]) expect(breakingVisibleAt(path, paths)).toBe(false);
  });
  it("normalizes whitespace and permits an optional link", () => {
    expect(breakingInputSchema.parse({ ...input(), text: "  Първо.\n\n Второ.  " }).text).toBe("Първо. Второ.");
    expect(breakingInputSchema.safeParse({ ...input(), text: "" }).success).toBe(false);
    expect(breakingInputSchema.safeParse({ ...input(), text: "", enabled: false }).success).toBe(true);
    expect(breakingInputSchema.safeParse({ ...input(), text: "а".repeat(501) }).success).toBe(false);
    expect(breakingInputSchema.safeParse({ ...input(), articleId: "https://foreign.invalid" }).success).toBe(false);
    expect(breakingInputSchema.safeParse({ ...input(), text: "bad\u0000text" }).success).toBe(false);
  });
});
describe("breaking-message database lifecycle", () => {
  it("keeps history, saves hidden content and emits only a public invalidation", async () => {
    const first = await writeBreaking(db, { ...input(), articleId }, "breaking-editor");
    expect(await readPublicBreaking(db)).toEqual({ version: first.after.version, text: input().text, path: "/breaking-fixture/" });
    const hidden = await writeBreaking(db, { ...input(first.after.version), articleId, enabled: false }, "breaking-editor");
    expect(await readPublicBreaking(db)).toBeNull();
    expect(await readBreakingSettings(db)).toMatchObject({ enabled: false, text: input().text, articleId });
    await writeBreaking(db, input(hidden.after.version), "breaking-editor");
    expect(await db.select().from(schema.breakingBulletins)).toHaveLength(3);
    const events = await db.select().from(schema.outboxEvents);
    expect(events).toHaveLength(3);
    expect(events.every(event => event.type === "breaking.updated" && event.entityId === null)).toBe(true);
    expect(events[0]?.payload).toEqual({ path: "/", title: "", topics: [] });
    expect(JSON.stringify(await readPublicBreaking(db))).not.toContain("actor");
  });
  it("rejects stale screens without creating a version or event", async () => {
    await writeBreaking(db, input(), "breaking-editor");
    await expect(writeBreaking(db, { ...input(), enabled: false }, "breaking-editor")).rejects.toMatchObject({ status: 409 });
    expect(await db.select().from(schema.breakingBulletins)).toHaveLength(1);
    expect(await db.select().from(schema.outboxEvents)).toHaveLength(1);
  });
  it("rejects nonpublic/future targets; removes links when a target becomes nonpublic", async () => {
    const first = await writeBreaking(db, { ...input(), articleId }, "breaking-editor");
    await db.update(schema.articles).set({ isPublic: false }).where(eq(schema.articles.id, articleId));
    expect(await readPublicBreaking(db)).toEqual({ version: first.after.version, text: input().text, path: null });
    await expect(writeBreaking(db, { ...input(first.after.version), articleId }, "breaking-editor")).rejects.toMatchObject({ code: "invalid_article" });
    await db.update(schema.articles).set({ isPublic: true, publishedAt: new Date("2099-01-01") }).where(eq(schema.articles.id, articleId));
    expect((await readPublicBreaking(db))?.path).toBeNull();
    await expect(writeBreaking(db, { ...input(first.after.version), articleId }, "breaking-editor")).rejects.toMatchObject({ code: "invalid_article" });
  });
  it("rolls back both history and notification if event insertion fails", async () => {
    await db.execute(sql`alter table outbox_events add constraint breaking_qa_reject check (type <> 'breaking.updated')`);
    try { await expect(writeBreaking(db, input(), "breaking-editor")).rejects.toThrow(); }
    finally { await db.execute(sql`alter table outbox_events drop constraint breaking_qa_reject`); }
    expect(await db.select().from(schema.breakingBulletins)).toHaveLength(0);
  });
});
