import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "@newspoint/db/schema";
import { listRevisionHistory, createArticle, getEditorArticle, publishRevision, saveRevision, setArticleVisibility } from "../apps/studio/lib/articles";
import { publishDueScheduled } from "../packages/db/src/scheduled-publish";
import { editorMutation } from "../apps/studio/lib/api";
import { draftInput } from "../apps/studio/lib/editor/input";
import type { DraftInput } from "../apps/studio/lib/editor/input";

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
  const included = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 17, 18, 19, 21, 24, 25, 26, 27, 30]);
  for (const file of readdirSync("packages/db/migrations").sort()) if (included.has(Number(file.slice(0, 2)))) await pg.exec(readFileSync(`packages/db/migrations/${file}`, "utf8"));
  await pg.exec(`insert into staff_users(id,name,email,role) values('qa-editor','QA Editor','qa@example.invalid','editor');`);
  await db.insert(schema.categories).values({ id: categoryId, slug: "qa-rubric", path: "/qa-rubric/", name: "QA", kind: "section" });
  await db.insert(schema.mediaAssets).values({ id: imageId, provider: "object_storage", storageKey: "news/2026/10/qa.webp", alt: "QA" });
}, 30000);
beforeEach(() => { vi.unstubAllEnvs(); });
afterAll(async () => { vi.unstubAllEnvs(); await pg?.close(); });

describe("editor API permissions and validation", () => {
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
    expect(await db.select().from(schema.articleCategories).where(eq(schema.articleCategories.articleId, created.id))).toHaveLength(1);
  });
});
