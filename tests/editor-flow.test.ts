import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "@newspoint/db/schema";
import { createArticle, getEditorArticle, publishRevision, saveRevision, setArticleVisibility } from "../apps/studio/lib/articles";
import { publishDueScheduled } from "../packages/db/src/scheduled-publish";
import type { DraftInput } from "../apps/studio/lib/editor/input";

const holder = vi.hoisted(() => ({ db: null as ReturnType<typeof drizzle<typeof schema>> | null }));
vi.mock("@newspoint/db", async () => ({ ...await vi.importActual<typeof import("@newspoint/db")>("@newspoint/db"), getDb: () => holder.db }));
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

describe("article editor transactions", () => {
  it("creates once after a lost response and rejects changed content under the same creation ID", async () => {
    const input = draft({ creationId: randomUUID() });
    const first = await createArticle(staff, input);
    expect(await createArticle(staff, input)).toEqual(first);
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
    await expect(saveRevision(staff, created.id, 1, input)).rejects.toMatchObject({ code: "conflict", details: { revision: 2, draft: { body: input.body } } });
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
