import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "@newspoint/db/schema";
import { sofiaWallToUtc } from "../packages/content/src/sofia-time";
import { listRevisionHistory, createArticle, getEditorArticle, publishRevision, saveRevision, setArticleVisibility, deleteArticle } from "../apps/studio/lib/articles";
import { publishDueScheduled } from "../packages/db/src/scheduled-publish";
import { editorMutation } from "../apps/studio/lib/api";
import { draftInput } from "../apps/studio/lib/editor/input";
import type { DraftInput } from "../apps/studio/lib/editor/input";
import { auditContext } from "../apps/studio/lib/audit-context";
import { auditChanges } from "../apps/studio/lib/audit-metadata";
import { placeArticle, publishArrangement, revertArrangement, saveArrangement, loadArrangement } from "../apps/studio/lib/arrangements";

const holder = vi.hoisted(() => ({ db: null as ReturnType<typeof drizzle<typeof schema>> | null }));
vi.mock("@newspoint/db", async () => ({ ...await vi.importActual<typeof import("@newspoint/db")>("@newspoint/db"), getDb: () => holder.db }));
const apiSession = vi.hoisted(() => ({ value: null as { id: string; name: string; email: string; role: string } | null }));
vi.mock("../apps/studio/lib/session", () => ({ staffFromRequest: () => apiSession.value }));
vi.mock("../apps/studio/lib/auth", () => ({ studioOrigins: () => ({ trusted: ["http://localhost:3001"] }) }));
let pg: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
const staff = { id: "qa-editor", name: "QA Editor", role: "editor" as const };
const categoryId = randomUUID();
const imageId = randomUUID();
const draft = (overrides: Partial<DraftInput> = {}): DraftInput => ({ title: "QA материал за проверка", slug: `qa-${randomUUID()}`, excerpt: "QA", body: [{ type: "paragraph", html: "<strong>Текст</strong>" }], primaryCategoryId: categoryId, heroMediaId: imageId, heroEmbedUrl: null, authorKind: "staff", authorUserId: staff.id, authorName: staff.name, listenEnabled: true, ...overrides });

beforeAll(async () => {
  pg = new PGlite(); db = drizzle(pg, { schema }); holder.db = db;
  // postgres-js returns arrays from execute; PGlite wraps raw results in {rows}.
  // Adapt only the driver return shape, preserving the actual queries and transactions.
  const adapt = (executor: { execute: (...args: never[]) => unknown }) => {
    const original = executor.execute.bind(executor);
    executor.execute = ((...args: never[]) => Promise.resolve(original(...args)).then(result => (result as { rows?: unknown }).rows ?? result)) as typeof executor.execute;
  };
  adapt(db as never);
  const transaction = db.transaction.bind(db);
  db.transaction = ((callback: (tx: unknown) => unknown) => transaction(async tx => { adapt(tx as never); return callback(tx); })) as typeof db.transaction;
  const included = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 17, 18, 19, 20, 21, 24, 25, 26, 27, 30, 38, 42]);
  for (const file of readdirSync("packages/db/migrations").sort()) if (included.has(Number(file.slice(0, 2)))) await pg.exec(readFileSync(`packages/db/migrations/${file}`, "utf8"));
  await pg.exec(`insert into staff_users(id,name,email,role) values('qa-editor','QA Editor','qa@example.invalid','editor');`);
  await db.insert(schema.categories).values({ id: categoryId, slug: "qa-rubric", path: "/qa-rubric/", name: "QA", kind: "section" });
  await db.insert(schema.mediaAssets).values({ id: imageId, provider: "object_storage", storageKey: "news/2026/10/qa.webp", alt: "QA" });
}, 30000);
beforeEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
afterAll(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await pg?.close(); });

describe("editor API permissions and validation", () => {
  it("refreshes visibility caches after commit and on retries without inventing another event", async () => {
    const created = await createArticle(staff, draft());
    await publishRevision(staff, created.id, 1, randomUUID(), true);
    vi.stubEnv("REVALIDATE_SECRET", "qa-secret");vi.stubEnv("WEB_URL", "https://public.example");vi.stubEnv("REVALIDATE_INTERNAL_URL", "http://127.0.0.1:3100");
    const request = vi.fn(async (_url: unknown, init: RequestInit) => {
      const [row] = await db.select().from(schema.articles).where(eq(schema.articles.id, created.id));
      expect(row?.isPublic).toBe(false);
      expect(JSON.parse(String(init.body)).paths).toEqual(expect.arrayContaining(["/", row!.path, "/qa-rubric/", "/feed/", "/sitemap.xml", "/llms.txt"]));
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", request);
    await expect(setArticleVisibility(created.id, false, staff)).resolves.toEqual({ isPublic: false });
    const [beforeRetry] = await db.select().from(schema.articles).where(eq(schema.articles.id, created.id));
    await setArticleVisibility(created.id, false, staff);
    const [afterRetry] = await db.select().from(schema.articles).where(eq(schema.articles.id, created.id));
    expect(afterRetry!.version).toBe(beforeRetry!.version);
    const events = await db.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.entityId, created.id));
    expect(events.filter(event => event.payload.visibilityChange?.visible === false)).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(String(request.mock.calls[0]![0])).toBe("http://127.0.0.1:3100/api/revalidate/");
  });
  it("does not refresh after a rejected visibility mutation or undo hiding when refresh fails", async () => {
    const created = await createArticle(staff, draft());
    vi.stubEnv("REVALIDATE_SECRET", "qa-secret");vi.stubEnv("WEB_URL", "https://public.example");
    const request = vi.fn().mockRejectedValue(Error("QA unavailable"));vi.stubGlobal("fetch", request);
    await expect(setArticleVisibility(created.id, true, staff)).rejects.toMatchObject({ code: "not_published" });
    expect(request).not.toHaveBeenCalled();
    await publishRevision(staff, created.id, 1, randomUUID(), true);
    await expect(setArticleVisibility(created.id, false, staff)).resolves.toEqual({ isPublic: false });
    const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, created.id));
    expect(article!.isPublic).toBe(false);expect(request).toHaveBeenCalled();
  });
  it("rejects foreign origins, expired sessions, unknown roles, malformed and ambiguous bodies", async () => {
    const run = vi.fn(async () => ({ saved: true }));
    const request = (origin: string, body: string) => new Request("http://localhost:3001/admin/api/editor/articles/", { method: "POST", headers: { origin, "content-type": "application/json" }, body });
    apiSession.value = null;
    expect((await editorMutation(request("https://foreign.invalid", "{}"), draftInput, run)).status).toBe(403);
    const expired = await editorMutation(request("http://localhost:3001", "{}"), draftInput, run);
    expect(expired.status).toBe(401); expect(expired.headers.get("cache-control")).toBe("no-store");
    apiSession.value = { ...staff, email: "qa@example.invalid", role: "reader" };
    expect((await editorMutation(request("http://localhost:3001", JSON.stringify(draft())), draftInput, run)).status).toBe(403);
    apiSession.value.role = "editor";
    expect((await editorMutation(request("http://localhost:3001", "invalid"), draftInput, run)).status).toBe(400);
    expect((await editorMutation(request("http://localhost:3001", JSON.stringify({ ...draft(), bodyText: "ambiguous" })), draftInput, run)).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
    for (const role of ["editor", "admin", "master_admin"]) { apiSession.value.role = role; expect((await editorMutation(request("http://localhost:3001", JSON.stringify(draft())), draftInput, run)).status).toBe(200); }
    expect(run).toHaveBeenCalledTimes(3); apiSession.value = null;
  });
});

describe("article editor transactions", () => {
  it("automatically queues public IndexNow changes, never autosave, and retains deletion", async () => {
    const input = draft();
    const created = await createArticle(staff, input);
    const queued = async () => (await pg.query<{ version: number; generation: number }>(
      "select version,generation from indexnow_jobs where article_id=$1", [created.id])).rows;
    expect(await queued()).toHaveLength(0);
    await publishRevision(staff, created.id, 1, randomUUID(), true);
    const first = (await queued())[0]!;
    await saveRevision(staff, created.id, 1, { ...input, title: "Explicit revised fixture" });
    expect(await queued()).toEqual([first]);
    await publishRevision(staff, created.id, 2, randomUUID(), true);
    expect((await queued())[0]!.generation).toBe(first.generation+1);
    await setArticleVisibility(created.id, false, staff);
    const hidden = (await queued())[0]!;
    expect(hidden.generation).toBe(first.generation+2);
    await deleteArticle({ ...staff, email: "qa@example.invalid" }, created.id);
    expect((await queued())[0]!.version).toBe(hidden.version+1);
    expect(await db.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.entityId,created.id))).toHaveLength(0);
  });
  it("creates the first Studio revision before updating an unchanged imported article", async () => {
    const input = draft();
    const id = randomUUID();
    const publishedAt = new Date("2026-10-01T10:00:00Z");
    await db.insert(schema.articles).values({
      id, sourceSystem: "wordpress", legacyId: 123456, slug: input.slug, path: `/${input.slug}/`,
      title: input.title, excerpt: input.excerpt, body: input.body!,
      primaryCategoryId: categoryId, heroMediaId: imageId,
      authorKind: "staff", authorUserId: staff.id, authorName: staff.name,
      isPublic: true, publishedAt, publishedRevision: null,
    });
    const loaded = await getEditorArticle(id);
    expect(loaded).toMatchObject({ sourceSystem: "wordpress", revision: 0, isPublic: true, publishedRevision: null });
    const { bodyText, ...payload } = loaded!.draft;
    const saved = await saveRevision(staff, id, 0, payload);
    expect(saved.revision).toBe(1);
    const outcome = await publishRevision(staff, id, saved.revision, randomUUID(), true);
    expect(outcome).toMatchObject({ type: "article.updated", revision: 1 });
    const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
    expect(article).toMatchObject({ sourceSystem: "wordpress", legacyId: 123456, publishedRevision: 1, body: input.body });
    expect(article?.publishedAt).toEqual(publishedAt);
  });
  it("captures exact committed revision content and view/listening settings for employee history", async () => {
    const input = draft({ viewSeed: 15, viewEvery: 1, viewUnit: "minutes", viewTarget: 20 });
    const created = await createArticle(staff, input);
    const context: Parameters<typeof auditContext.run>[0] = { id: randomUUID(), actor: { ...staff, email: "qa@example.invalid" }, details: {} };
    const next = { ...input, title: "QA променено заглавие", body: [{ type: "paragraph" as const, html: "QA нов текст" }], listenEnabled: false, viewEvery: 2 };
    await auditContext.run(context, () => saveRevision(staff, created.id, 1, next));
    expect(context.evidence).toMatchObject({ before: { revision: 1, draft: { title: input.title, listenEnabled: true, viewEvery: 1 } }, after: { revision: 2, draft: { title: next.title, body: next.body, listenEnabled: false, viewEvery: 2 } } });
    const changes = auditChanges(context.evidence!.before, context.evidence!.after);
    expect(changes).toContainEqual({ field: "draft.title", before: input.title, after: next.title });
    expect(changes.some(change => change.field === "draft.bodyText" && String(change.after).includes("QA нов текст"))).toBe(true);
  });
  it("captures placement deadlines, publication and reversion with exact documents", async () => {
    const created = await createArticle(staff, draft());
    await publishRevision(staff, created.id, 1, randomUUID(), true);
    const context: Parameters<typeof auditContext.run>[0] = { id: randomUUID(), actor: { ...staff, email: "qa@example.invalid" }, details: {} };
    await auditContext.run(context, () => placeArticle({ ...staff, email: "qa@example.invalid" }, { pageKey: "home", slot: "hero", articleId: created.id, hours: 3 }));
    expect(context.evidence?.after).toMatchObject({ document: { slots: { hero: { items: [{ articleId: created.id, endsAt: expect.any(String) }] } } } });
    await auditContext.run(context, () => publishArrangement({ ...staff, email: "qa@example.invalid" }, "home"));
    const first = (await db.select().from(schema.pageArrangements).where(eq(schema.pageArrangements.status, "published")))[0]!;
    await auditContext.run(context, () => placeArticle({ ...staff, email: "qa@example.invalid" }, { pageKey: "home", slot: "hero", articleId: created.id, hours: null }));
    await auditContext.run(context, () => publishArrangement({ ...staff, email: "qa@example.invalid" }, "home"));
    expect(auditChanges(context.evidence!.before, context.evidence!.after).some(change => change.field.includes("hero"))).toBe(true);
    await auditContext.run(context, () => revertArrangement({ ...staff, email: "qa@example.invalid" }, "home", first.id));
    expect(context.evidence?.after).toMatchObject({ document: first.document });
  });
  it("records the publication and visibility actually written, with no invented change on retries", async () => {
    const input = draft(); const created = await createArticle(staff, input); const key = randomUUID();
    const context: Parameters<typeof auditContext.run>[0] = { id: randomUUID(), actor: { ...staff, email: "qa@example.invalid" }, details: {} };
    await auditContext.run(context, () => publishRevision(staff, created.id, 1, key, true));
    expect(context.evidence).toMatchObject({ before: { isPublic: false, publishedRevision: null }, after: { isPublic: true, publishedRevision: 1, title: input.title, body: input.body } });
    await auditContext.run(context, () => publishRevision(staff, created.id, 1, key, true));
    expect(context.evidence).toEqual({ before: null, after: null });
    await auditContext.run(context, () => setArticleVisibility(created.id, false, staff));
    expect(context.evidence).toMatchObject({ before: { isPublic: true }, after: { isPublic: false } });
    await auditContext.run(context, () => setArticleVisibility(created.id, false, staff));
    expect(auditChanges(context.evidence!.before, context.evidence!.after)).toEqual([]);
  });
  it("preserves unrecognized archive bodies while saving metadata and refuses a replacement", async () => {
    const input = draft(); const created = await createArticle(staff, input);
    const archive = [{ type: "future_archive_block", html: "Original archive" }];
    await db.update(schema.articleRevisions).set({ body: archive }).where(eq(schema.articleRevisions.articleId, created.id));
    const { body, ...legacy } = input;
    await saveRevision(staff, created.id, 1, { ...legacy, bodyText: "ignored", title: "Ново заглавие" });
    const history = await listRevisionHistory(created.id); expect(history.revisions[0]?.editableBody).toBe(false);
    const rows = await pg.query("select body from article_revisions where article_id=$1 and number=2", [created.id]); expect(rows.rows[0]?.body).toEqual(archive);
    await expect(saveRevision(staff, created.id, 2, input)).rejects.toMatchObject({ code: "body_locked" });
  });
  it("keeps a scheduled draft private, cancels scheduling and isolates the save-triggered scheduler", async () => {
    const future = await createArticle(staff, draft({ publishAtSofia: "2099-01-01T12:00" }));
    expect((await getEditorArticle(future.id))?.isPublic).toBe(false);
    const input = (await getEditorArticle(future.id))!.draft;
    const { bodyText, ...structured } = input;
    await saveRevision(staff, future.id, 1, { ...structured, publishAtSofia: null });
    expect((await getEditorArticle(future.id))?.draft.publishAtSofia).toBeNull();
    await db.update(schema.articles).set({ scheduledPublishAt: sql`now()-interval '1 minute'` }).where(eq(schema.articles.id, future.id));
    await createArticle(staff, draft());
    expect((await getEditorArticle(future.id))?.isPublic).toBe(false);
    expect(await publishDueScheduled(db as never, future.id)).toBe(1);
  });
  it("seeds editorial views consistently for manual and scheduled publication", async () => {
    for (const scheduled of [false, true]) {
      const created = await createArticle(staff, draft({ viewSeed: 25, viewEvery: 1, viewUnit: "minutes", viewTarget: 50 }));
      if (scheduled) { await db.update(schema.articles).set({ scheduledPublishAt: sql`now()-interval '1 minute'` }).where(eq(schema.articles.id, created.id)); await publishDueScheduled(db as never, created.id); }
      else await publishRevision(staff, created.id, 1, randomUUID(), true);
      const [boost] = await db.select().from(schema.articleViewBoosts).where(eq(schema.articleViewBoosts.articleId, created.id));
      expect(boost).toMatchObject({ artificialCount: 25, seedCount: 25 });
      expect(boost?.seededAt).toBeTruthy(); expect(boost?.nextIncrementAt).toBeTruthy();
    }
  });
  it("applies a configured starting total at first publication, accounting for existing real reads", async () => {
    const input = draft({ viewSeed: 25, viewEvery: 4, viewUnit: "minutes", viewTarget: 50 });
    const created = await createArticle(staff, input);
    await db.insert(schema.articleReadCounts).values({ articleId: created.id, readCount: 3 });
    await publishRevision(staff, created.id, 1, randomUUID(), true);
    const editor = await getEditorArticle(created.id);
    expect(editor).toMatchObject({ viewReal: 3, viewAdded: 22, viewSeedLocked: true, draft: { viewSeed: 25, viewEvery: 4, viewUnit: "minutes", viewTarget: 50 } });
    const [boost] = await db.select().from(schema.articleViewBoosts).where(eq(schema.articleViewBoosts.articleId, created.id));
    expect(boost?.intervalSeconds).toBe(240);expect(boost?.nextIncrementAt).toBeTruthy();
  });
  it("keeps a late starting total pending until explicit update, then applies it only once", async () => {
    const initial = draft();const created = await createArticle(staff, initial);
    await publishRevision(staff, created.id, 1, randomUUID(), true);
    await db.insert(schema.articleReadCounts).values({ articleId: created.id, readCount: 3 });
    const settings = { ...initial, viewSeed: 25, viewEvery: 4, viewUnit: "minutes" as const, viewTarget: 50 };
    await saveRevision(staff, created.id, 1, settings);
    const pending = await getEditorArticle(created.id);
    expect(pending).toMatchObject({ publishedRevision: 1, revision: 2, viewReal: 3, viewAdded: 0, viewSeedLocked: false, draft: { viewSeed: 25, viewEvery: 4, viewTarget: 50 } });
    const key = randomUUID();await publishRevision(staff, created.id, 2, key, true);
    expect(await getEditorArticle(created.id)).toMatchObject({ publishedRevision: 2, viewReal: 3, viewAdded: 22, viewSeedLocked: true });
    const [applied] = await db.select().from(schema.articleViewBoosts).where(eq(schema.articleViewBoosts.articleId, created.id));
    expect(applied?.seededAt).toBeTruthy();expect(applied?.nextIncrementAt).toBeTruthy();
    expect((await publishRevision(staff, created.id, 2, key, true)).duplicate).toBe(true);
    await saveRevision(staff, created.id, 2, settings);await publishRevision(staff, created.id, 3, randomUUID(), true);
    const [repeated] = await db.select().from(schema.articleViewBoosts).where(eq(schema.articleViewBoosts.articleId, created.id));
    expect(repeated?.artificialCount).toBe(22);expect(repeated?.seededAt).toEqual(applied?.seededAt);
  });
  it("corrects the public view total and publish time after publication", async () => {
    const input = draft({ viewSeed: 25, viewEvery: 4, viewUnit: "minutes", viewTarget: 80 });
    const created = await createArticle(staff, input);
    await db.insert(schema.articleReadCounts).values({ articleId: created.id, readCount: 3 });
    await publishRevision(staff, created.id, 1, randomUUID(), true);
    expect((await getEditorArticle(created.id))?.draft.publishAtSofia).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    await saveRevision(staff, created.id, 1, { ...input, viewSeed: 40, publishAtSofia: "2024-05-06T08:15" });
    expect(await getEditorArticle(created.id)).toMatchObject({ viewReal: 3, viewAdded: 37, draft: { viewSeed: 40, publishAtSofia: "2024-05-06T08:15" } });
    const [row] = await db.select().from(schema.articles).where(eq(schema.articles.id, created.id));
    expect(row?.publishedAt?.toISOString()).toBe(sofiaWallToUtc("2024-05-06T08:15")!.toISOString());
    await db.update(schema.articleViewBoosts).set({ artificialCount: 50 }).where(eq(schema.articleViewBoosts.articleId, created.id));
    expect((await getEditorArticle(created.id))?.draft.viewSeed).toBe(53);
    await saveRevision(staff, created.id, 2, { ...input, viewSeed: 53, publishAtSofia: "2024-05-06T08:15" });
    const [kept] = await db.select().from(schema.articleViewBoosts).where(eq(schema.articleViewBoosts.articleId, created.id));
    expect(kept?.artificialCount).toBe(50);
    await expect(saveRevision(staff, created.id, 3, { ...input, viewSeed: 53, publishAtSofia: "2099-01-01T12:00" })).rejects.toMatchObject({ code: "published_future" });
    const [unchanged] = await db.select().from(schema.articles).where(eq(schema.articles.id, created.id));
    expect(unchanged?.publishedAt?.toISOString()).toBe(row?.publishedAt?.toISOString());
  });
  it("keeps hidden public content intact until explicit republishing and emits an update", async () => {
    const input = draft(); const created = await createArticle(staff, input);
    await publishRevision(staff, created.id, 1, randomUUID(), true); await setArticleVisibility(created.id, false);
    await saveRevision(staff, created.id, 1, { ...input, title: "Нова скрита версия" });
    const [stored] = await db.select().from(schema.articles).where(eq(schema.articles.id, created.id)); expect(stored?.title).toBe(input.title);
    expect((await publishRevision(staff, created.id, 2, randomUUID(), true)).type).toBe("article.updated");
    expect((await pg.query("select * from push_jobs where article_id=$1", [created.id])).rows).toHaveLength(1);
  });
  it("creates once after a lost response and rejects changed content under the same creation ID", async () => {
    const input = draft({ creationId: randomUUID() });
    const first = await createArticle(staff, input);
    expect(await createArticle(staff, input)).toEqual(first);
    await expect(createArticle(staff, { ...input, listenEnabled: false })).rejects.toMatchObject({ code: "creation_id_reused" });
    await expect(createArticle(staff, { ...input, viewSeed: 50 })).rejects.toMatchObject({ code: "creation_id_reused" });
    await expect(createArticle(staff, { ...input, title: "Друга версия" })).rejects.toMatchObject({ code: "creation_id_reused" });
    const revisions = await db.select().from(schema.articleRevisions).where(eq(schema.articleRevisions.articleId, first.id));
    expect(revisions).toHaveLength(1);
  });
  it("saves listening with the revision, retains the public version and rejects stale editors", async () => {
    const input = draft(); const created = await createArticle(staff, input);
    await publishRevision(staff, created.id, 1, randomUUID(), true);
    const next = { ...input, title: "Редактирана версия", listenEnabled: false };
    expect(await saveRevision(staff, created.id, 1, next)).toEqual({ revision: 2 });
    const [published] = await db.select().from(schema.articles).where(eq(schema.articles.id, created.id));
    expect(published?.listenEnabled).toBe(true); expect(published?.title).toBe(input.title);
    expect((await getEditorArticle(created.id))?.draft.listenEnabled).toBe(false);
    await expect(saveRevision(staff, created.id, 1, input)).rejects.toMatchObject({ code: "conflict", details: { revision: 2, draft: { body: input.body, listenEnabled: false } } });
    await expect(publishRevision(staff, created.id, 1, randomUUID(), true)).rejects.toMatchObject({ code: "stale_publication" });
    expect((await listRevisionHistory(created.id)).revisions.map(item => item.number)).toEqual([2, 1]);
    await publishRevision(staff, created.id, 2, randomUUID(), false);
    expect((await getEditorArticle(created.id))?.listenEnabled).toBe(false);
  });
  it("publishes a hero embed once and binds idempotency to listening settings", async () => {
    const input = draft({ heroMediaId: null, heroEmbedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ" });
    const created = await createArticle(staff, input); const key = randomUUID();
    await publishRevision(staff, created.id, 1, key, true);
    expect((await publishRevision(staff, created.id, 1, key, true)).duplicate).toBe(true);
    await expect(publishRevision(staff, created.id, 1, key, false)).rejects.toMatchObject({ code: "idempotency_key_reused" });
    const [published] = await db.select().from(schema.articles).where(eq(schema.articles.id, created.id));
    expect(published?.heroEmbedUrl).toBe(input.heroEmbedUrl);
  });
  it("keeps a canonical slug locked after hiding, and rejects missing media", async () => {
    const input = draft(); const created = await createArticle(staff, input);
    await publishRevision(staff, created.id, 1, randomUUID(), true); await setArticleVisibility(created.id, false);
    await expect(saveRevision(staff, created.id, 1, { ...input, slug: "different" })).rejects.toMatchObject({ code: "slug_locked" });
    await expect(createArticle(staff, draft({ body: [{ type: "image", mediaAssetId: randomUUID() }] }))).rejects.toMatchObject({ code: "invalid_media" });
  });
  it("blocks reserved paths and unsafe hero iframes", async () => {
    const created = await createArticle(staff, draft({ slug: "team" }));
    await expect(publishRevision(staff, created.id, 1, randomUUID(), true)).rejects.toMatchObject({ code: "not_ready" });
  });
  it("registers QA before publication and excludes only QA IDs from reader push", async () => {
    vi.stubEnv("EDITOR_QA_RUN_ID", "integration");
    const input = draft({ title: "[QA editor] проверка", slug: "qa-editor-integration-push" });
    const created = await createArticle(staff, input);
    await publishRevision(staff, created.id, 1, randomUUID(), true);
    const jobs = await pg.query("select * from push_jobs where article_id=$1", [created.id]);
    expect(jobs.rows).toHaveLength(0);
    expect((await pg.query("select * from indexnow_jobs where article_id=$1", [created.id])).rows).toHaveLength(0);
    await deleteArticle({ ...staff, email: "qa@example.invalid" }, created.id);
    expect((await pg.query("select * from indexnow_jobs where article_id=$1", [created.id])).rows).toHaveLength(0);
    vi.unstubAllEnvs(); const real = await createArticle(staff, draft());
    await publishRevision(staff, real.id, 1, randomUUID(), true);
    expect((await pg.query("select * from push_jobs where article_id=$1", [real.id])).rows).toHaveLength(1);
  });
  it("uses the same scheduled checks, saved listening and rubric link", async () => {
    const created = await createArticle(staff, draft({ heroMediaId: null, heroEmbedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", listenEnabled: false }));
    await db.update(schema.articles).set({ scheduledPublishAt: sql`now()-interval '1 minute'` }).where(eq(schema.articles.id, created.id));
    expect(await publishDueScheduled(db as never)).toBe(1);
    const article = await getEditorArticle(created.id);
    expect(article).toMatchObject({ isPublic: true, listenEnabled: false });
    expect((await pg.query("select * from indexnow_jobs where article_id=$1", [created.id])).rows).toHaveLength(1);
    expect(await db.select().from(schema.articleCategories).where(eq(schema.articleCategories.articleId, created.id))).toHaveLength(1);
  });
});


describe("article hero placement", () => {
  const actor = { ...staff, email: "qa@example.invalid" };
  const keys = ["hero", "support-0", "support-1", "support-2"];
  const item = (id: string) => ({ articleId: id, startsAt: null, endsAt: null, placedBy: "Редактор", placedAt: null });
  const state = () => loadArrangement("home");
  beforeAll(async () => { await db.insert(schema.categories).values({ slug: "plovdiv", path: "/plovdiv/", name: "Пловдив", kind: "section" }); });
  beforeEach(async () => { await db.delete(schema.pageArrangements); });

  it.each([1, 2, 3, 4] as const)("publishes directly at position %i, replaces its whole queue and preserves other draft/live differences", async position => {
    const old = await createArticle(staff, draft());
    const queued = await createArticle(staff, draft());
    const input = draft({ homeHeroPosition: position });
    const created = await createArticle(staff, input);
    const original = { slots: Object.fromEntries(keys.map(key => [key, { items: [item(old.id), item(queued.id)] }])), excluded: [old.id] };
    await saveArrangement(actor, "home", original, "live note");
    await publishArrangement(actor, "home");
    const liveBefore = (await state()).published;
    const draftOnly = { ...original, slots: { ...original.slots, "latest-0": { items: [item(queued.id)] } } };
    await saveArrangement(actor, "home", draftOnly, "private draft note");
    expect((await getEditorArticle(created.id))?.draft.homeHeroPosition).toBe(position);
    const draftBefore = (await state()).draft;
    expect((await state()).published).toEqual(liveBefore);
    const key = randomUUID();
    await publishRevision(staff, created.id, 1, key, true);
    const after = await state();
    expect(after.articles[created.id]).toMatchObject({ title: input.title, imageUrl: "/media/news/2026/10/qa.webp" });
    const target = keys[position - 1]!;
    expect(after.published.slots[target]?.items).toEqual([{ articleId: created.id, startsAt: null, endsAt: null, placedBy: staff.name, placedAt: expect.any(String) }]);
    expect(after.draft.slots[target]).toEqual(after.published.slots[target]);
    expect(after.published.slots["latest-0"]).toBeUndefined();
    expect(after.draft.slots["latest-0"]).toEqual(draftBefore.slots["latest-0"]);
    expect(after.note).toBe("private draft note");
    expect(after.published.excluded).toEqual(original.excluded);
    for (const other of keys.filter(key => key !== target)) expect(after.published.slots[other]).toEqual(liveBefore.slots[other]);
    expect((await getEditorArticle(created.id))?.draft.homeHeroPosition).toBeNull();
    const version = after.version;
    expect((await publishRevision(staff, created.id, 1, key, true)).duplicate).toBe(true);
    await publishRevision(staff, created.id, 1, randomUUID(), true);
    expect((await state()).version).toBe(version);
  });

  it("schedules placement with the latest saved revision, never on draft save", async () => {
    const input = draft({ homeHeroPosition: 1, publishAtSofia: "2099-01-01T12:00" });
    const created = await createArticle(staff, input);
    await saveRevision(staff, created.id, 1, { ...input, homeHeroPosition: 4 });
    expect((await state()).published.slots).toEqual({});
    await db.update(schema.articles).set({ scheduledPublishAt: sql`now()-interval '1 minute'` }).where(eq(schema.articles.id, created.id));
    expect(await publishDueScheduled(db as never, created.id)).toBe(1);
    expect((await state()).published.slots["support-2"]?.items[0]).toMatchObject({ articleId: created.id, endsAt: null, placedBy: staff.name });
    expect(await publishDueScheduled(db as never, created.id)).toBe(0);
    const editor = (await getEditorArticle(created.id))!;
    expect(editor.draft.homeHeroPosition).toBeNull();
    const { bodyText, ...next } = editor.draft;
    await saveRevision(staff, created.id, 2, { ...next, title: "Обновено заглавие" });
    const before = (await state()).version;
    await publishRevision(staff, created.id, 3, randomUUID(), true);
    expect((await state()).version).toBe(before);
  });

  it("moves an article only within hero and leaves its rubric placement intact", async () => {
    const input = draft({ homeHeroPosition: 1 }); const created = await createArticle(staff, input);
    await publishRevision(staff, created.id, 1, randomUUID(), true);
    const current = await state();
    await saveArrangement(actor, "home", { ...current.draft, slots: { ...current.draft.slots, "section:plovdiv:0": { items: [item(created.id)] } } }, "");
    await publishArrangement(actor, "home");
    await saveRevision(staff, created.id, 1, { ...input, homeHeroPosition: 3 });
    await publishRevision(staff, created.id, 2, randomUUID(), true);
    expect((await state()).published.slots.hero?.items).toEqual([]);
    expect((await state()).published.slots["support-1"]?.items[0]?.articleId).toBe(created.id);
    expect((await state()).published.slots["section:plovdiv:0"]?.items[0]?.articleId).toBe(created.id);
    await deleteArticle(staff, created.id);
    expect((await state()).published.slots["support-1"]?.items).toEqual([]);
  });

  it("rejects all stale arrangement writers after direct article placement", async () => {
    const first = await createArticle(staff, draft()); await publishRevision(staff, first.id, 1, randomUUID(), true);
    await placeArticle(actor, { pageKey: "home", slot: "hero", articleId: first.id, hours: 2 });
    await publishArrangement(actor, "home");
    const stale = await state();
    const second = await createArticle(staff, draft({ homeHeroPosition: 2 }));
    await publishRevision(staff, second.id, 1, randomUUID(), true);
    await expect(saveArrangement(actor, "home", stale.draft, "", stale.version)).rejects.toMatchObject({ code: "arrangement_conflict" });
    await expect(publishArrangement(actor, "home", stale.version)).rejects.toMatchObject({ code: "arrangement_conflict" });
    await expect(revertArrangement(actor, "home", randomUUID(), stale.version)).rejects.toMatchObject({ code: "arrangement_conflict" });
    await expect(placeArticle(actor, { pageKey: "home", slot: "hero", articleId: first.id, hours: null, expectedVersion: stale.version })).rejects.toMatchObject({ code: "arrangement_conflict" });
    const fresh = await state();
    const saved = await saveArrangement(actor, "home", fresh.draft, "fresh", fresh.version);
    await publishArrangement(actor, "home", saved.version);
    expect((await state()).published.slots["support-0"]?.items[0]?.articleId).toBe(second.id);
  });

  it("does not reapply a pending choice from an editor left open across scheduled publication", async () => {
    const input = draft({ homeHeroPosition: 2, publishAtSofia: "2099-01-01T12:00" });
    const created = await createArticle(staff, input);
    await db.update(schema.articles).set({ scheduledPublishAt: sql`now()-interval '1 minute'` }).where(eq(schema.articles.id, created.id));
    await publishDueScheduled(db as never, created.id);
    await expect(saveRevision(staff, created.id, 1, { ...input, title: "Stale editor", homeHeroExpectedPublishedRevision: null })).rejects.toMatchObject({ code: "publication_changed" });
    expect((await getEditorArticle(created.id))?.revision).toBe(1);
  });

  it("places through the old dialog without publishing unrelated saved draft changes", async () => {
    const a = await createArticle(staff, draft()); await publishRevision(staff, a.id, 1, randomUUID(), true);
    const b = await createArticle(staff, draft()); await publishRevision(staff, b.id, 1, randomUUID(), true);
    await placeArticle(actor, { pageKey: "home", slot: "hero", articleId: a.id, hours: null, publish: true });
    const live = await state();
    await saveArrangement(actor, "home", { ...live.draft, slots: { ...live.draft.slots, "latest-0": { items: [item(b.id)] } } }, "unpublished");
    await placeArticle(actor, { pageKey: "home", slot: "support-0", articleId: b.id, hours: 2, publish: true });
    const after = await state();
    expect(after.published.slots["latest-0"]).toBeUndefined();
    expect(after.draft.slots["latest-0"]?.items[0]?.articleId).toBe(b.id);
    expect(after.published.slots["support-0"]?.items[0]?.articleId).toBe(b.id);
  });

  it("rolls back the article, revision receipt and arrangement together on placement failure", async () => {
    const created = await createArticle(staff, draft({ homeHeroPosition: 2 }));
    await pg.exec("create function qa_reject_layout() returns trigger language plpgsql as $$ begin if new.type='layout.updated' then raise exception 'QA failure'; end if; return new; end $$; create trigger qa_reject_layout before insert on outbox_events for each row execute function qa_reject_layout();");
    const key = randomUUID();
    try {
      await expect(publishRevision(staff, created.id, 1, key, true)).rejects.toThrow();
      expect((await getEditorArticle(created.id))?.isPublic).toBe(false);
      expect((await state()).published.slots).toEqual({});
      expect(await db.select().from(schema.publishRequests).where(eq(schema.publishRequests.idempotencyKey, key))).toHaveLength(0);
    } finally { await pg.exec("drop trigger qa_reject_layout on outbox_events; drop function qa_reject_layout();"); }
    await publishRevision(staff, created.id, 1, key, true);
    expect((await state()).published.slots["support-0"]?.items[0]?.articleId).toBe(created.id);
  });

  it("keeps old databases usable but rejects a selected position without migration 38", async () => {
    await pg.exec("alter table article_revisions drop column home_hero_position");
    try {
      const normal = await createArticle(staff, draft());
      await publishRevision(staff, normal.id, 1, randomUUID(), true);
      const id = randomUUID();
      await expect(createArticle(staff, draft({ creationId: id, homeHeroPosition: 2 }))).rejects.toMatchObject({ code: "migration_required" });
      expect(await db.select().from(schema.articles).where(eq(schema.articles.id, id))).toHaveLength(0);
    } finally { await pg.exec(readFileSync("packages/db/migrations/38_article_home_hero.sql", "utf8")); }
  });

  it("validates positions and preserves pending settings on revision conflicts and in history", async () => {
    for (const position of [0, 5, 1.5, "2"]) expect(draftInput.safeParse(draft({ homeHeroPosition: position as never })).success).toBe(false);
    const input = draft({ homeHeroPosition: 1 }); const created = await createArticle(staff, input);
    await saveRevision(staff, created.id, 1, { ...input, homeHeroPosition: 4 });
    await expect(saveRevision(staff, created.id, 1, input)).rejects.toMatchObject({ code: "conflict", details: { draft: { homeHeroPosition: 4 } } });
    const history = await listRevisionHistory(created.id);
    expect(history.revisions.map(row => row.draft.homeHeroPosition)).toEqual([4, 1]);
  });
});
