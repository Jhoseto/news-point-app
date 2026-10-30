import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomUUID, createHmac } from "node:crypto";
import sharp from "../apps/worker/node_modules/sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "@newspoint/db/schema";
import type { ScriptDb } from "@newspoint/db/node";
import { createSessionClient } from "../packages/db/src/connection";
import { createArticle, getEditorArticle, listRevisionHistory, publishRevision, saveRevision } from "../apps/studio/lib/articles";
import { publishDueScheduled } from "../packages/db/src/scheduled-publish";
import { hasPodcastSocialPublishing, readPodcastSocialStatus, readRevisionSocial, retrySocialPublication, sharePodcastToFacebook } from "../packages/db/src/social-publishing";
import { claimSocialJob, prepareSocialPhoto, processSocialJob } from "../apps/worker/src/social-publishing-worker";
import { defaultSocial } from "../packages/content/src/social-publishing";
import { FacebookError, type FacebookClient } from "../packages/content/src/facebook-api";
import { MakeSocialError, type MakeSocialClient } from "../packages/content/src/make-social-api";
import { disconnectFacebook, facebookSettings, selectFacebookPage, startFacebookConnection, finishFacebookConnection, removeFacebookAuthorization } from "../apps/studio/lib/social-facebook";
import { encryptSocialSecret } from "../packages/content/src/social-secrets";
import { renderFacebookPostImage } from "../apps/worker/src/facebook-post-image";
import { readInstagramStatus, retryInstagramPublication, type InstagramJob } from "../packages/db/src/instagram-publishing";
import { claimInstagramJob, processInstagramJob, prepareInstagramPhoto } from "../apps/worker/src/instagram-publishing-worker";
import { InstagramError } from "../packages/content/src/instagram-api";

const holder = vi.hoisted(() => ({ db: null as ScriptDb | null }));
vi.mock("@newspoint/db", async () => ({ ...await vi.importActual<typeof import("@newspoint/db")>("@newspoint/db"), getDb: () => holder.db }));
const real = process.env.NP_SOCIAL_REAL_PG === "1";
let pg: PGlite | undefined; let client: ReturnType<typeof createSessionClient> | undefined; let db: ScriptDb;
const actor = { id: "facebook-qa-editor", name: "Isolated QA editor", email: "qa@example.invalid", role: "editor" as const };
const admin = { ...actor, role: "master_admin" as const };
const categoryId = randomUUID(), mediaId = randomUUID();
let fixtureRoot = "";
const input = () => ({ title: "Explicit isolated Facebook QA fixture", slug: `isolated-social-${randomUUID()}`, excerpt: "Isolated test only", body: [{ type: "paragraph" as const, html: "Explicit local QA fixture" }], primaryCategoryId: categoryId, heroMediaId: mediaId, heroEmbedUrl: null, authorKind: "staff" as const, authorUserId: actor.id, authorName: actor.name, listenEnabled: false,
  social: { facebook: { enabled: true, text: "Custom isolated fixture", textMode: "custom" as const } } });
const api = () => ({ uploadPhoto: vi.fn().mockResolvedValue({ photoId: "22", postId: "11_22" }), photoPost: vi.fn().mockResolvedValue("11_22"),
  post: vi.fn().mockResolvedValue({ id: "11_22", permalink_url: "https://www.facebook.com/11/posts/22" }), comment: vi.fn().mockResolvedValue("22_33"),
  comments: vi.fn().mockResolvedValue([]), page: vi.fn().mockResolvedValue({ id: "11" }) });
const makeApi = () => ({
  publish: vi.fn().mockResolvedValue({ ok: true, postId: "11_22", commentId: "22_33", permalink: "https://www.facebook.com/11/posts/22" }),
  comment: vi.fn().mockResolvedValue({ ok: true, postId: "11_22", commentId: "22_33", permalink: "https://www.facebook.com/11/posts/22" }),
});
function useMake() {
  vi.stubEnv("SOCIAL_PUBLISHING_PROVIDER", "make"); vi.stubEnv("MAKE_SOCIAL_WEBHOOK_URL", "https://hook.eu2.make.com/fixture");
  vi.stubEnv("MAKE_SOCIAL_WEBHOOK_API_KEY", "fixture-key"); vi.stubEnv("MAKE_FACEBOOK_PAGE_ID", "11"); vi.stubEnv("MAKE_FACEBOOK_PAGE_NAME", "News Point");
}
const jobFor = async (id: string) => (await db.select().from(schema.socialPublications).where(eq(schema.socialPublications.articleId, id)))[0]!;
async function makeJob(step = "photo") {
  const draft = input(); const created = await createArticle(actor, draft); await publishRevision(actor, created.id, 1, randomUUID(), false);
  await db.update(schema.socialPublications).set({ step }).where(eq(schema.socialPublications.articleId, created.id));
  return created.id;
}
beforeAll(async () => {
  if (real) {
    client = createSessionClient("postgres://social_qa@127.0.0.1:55439/social_publishing_qa", 8); db = drizzle(client, { schema });
    const [identity] = await client`select current_database() as name, inet_server_port() as port`;
    expect(identity).toMatchObject({ name: "social_publishing_qa", port: 55439 });
    // Only this newly created, name/port-verified fixture DB; never reads .env.local.
    await client.unsafe("drop schema public cascade; create schema public");
  } else {
    pg = new PGlite(); const embedded = pgliteDrizzle(pg, { schema });
    const adapt = (executor: { execute: (...args: never[]) => unknown }) => {
      const original = executor.execute.bind(executor); executor.execute = ((...args: never[]) => Promise.resolve(original(...args)).then(r => (r as { rows?: unknown }).rows ?? r)) as typeof executor.execute;
    };
    adapt(embedded as never); const transaction = embedded.transaction.bind(embedded);
    embedded.transaction = ((cb: (tx: unknown) => unknown) => transaction(async tx => { adapt(tx as never); return cb(tx); })) as typeof embedded.transaction;
    db = embedded as unknown as ScriptDb;
  }
  holder.db = db;
  const migrationClient = client ? createSessionClient("postgres://social_qa@127.0.0.1:55439/social_publishing_qa", 1) : undefined;
  const included = new Set([1,2,3,4,5,6,7,8,9,12,13,17,18,19,20,21,22,24,25,26,27,30,37,38,39,43,50]);
  for (const file of readdirSync("packages/db/migrations").sort()) if (included.has(Number(file.slice(0,2)))) {
    const migration = readFileSync(`packages/db/migrations/${file}`, "utf8");
    if (pg) await pg.exec(migration); else await migrationClient!.unsafe(migration);
  }
  await migrationClient?.end({ timeout: 5 });
  await db.insert(schema.staffUsers).values({ id: actor.id, name: actor.name, email: actor.email, role: "master_admin" });
  await db.insert(schema.categories).values({ id: categoryId, slug: "plovdiv", path: "/plovdiv/", name: "QA fixture rubric", kind: "section" });
  await db.insert(schema.mediaAssets).values({ id: mediaId, provider: "object_storage", storageKey: "news/2026/10/fixture.webp", mime: "image/webp" });
  fixtureRoot = await mkdtemp(resolve(tmpdir(), "np-facebook-qa-"));
  await mkdir(resolve(fixtureRoot, "media/news/2026/10"), { recursive: true });
  await writeFile(resolve(fixtureRoot, "media/news/2026/10/fixture.webp"), await sharp({ create: { width: 64, height: 48, channels: 3, background: "#789abc" } }).webp().toBuffer());
  await mkdir(resolve(fixtureRoot, "media/podcasts/2026/10"), { recursive: true });
  await writeFile(resolve(fixtureRoot, "media/podcasts/2026/10/12ab-cd34.webp"), await sharp({ create: { width: 80, height: 80, channels: 3, background: "#506080" } }).webp().toBuffer());
}, 30000);
beforeEach(async () => {
  await db.execute(sql`delete from instagram_publications`);
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.stubEnv("WEB_URL", "https://site44159-izdo3c.scloudsite101.com"); vi.stubEnv("STUDIO_PUBLIC_URL", "https://site44159-izdo3c.scloudsite101.com/admin");
  vi.stubEnv("SOCIAL_PUBLISHING_ENABLED", "1"); vi.stubEnv("EDITOR_QA_RUN_ID", ""); vi.stubEnv("MEDIA_ROOT", resolve(fixtureRoot, "media"));
  vi.stubEnv("MEDIA_SSH_TARGET", ""); vi.stubEnv("SOCIAL_PUBLISHING_TEMP_ROOT", resolve(fixtureRoot, "private"));
  vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 42).toString("base64")); vi.stubEnv("META_APP_ID", "123");
  await db.delete(schema.socialPublications); await db.delete(schema.socialConnections); await db.delete(schema.socialOauthStates);
  await db.insert(schema.socialConnections).values({ provider: "facebook", pageId: "11", name: "Explicit QA page fixture", encryptedToken: "not-a-live-token", status: "connected" });
});
afterAll(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await pg?.close(); await client?.end({ timeout: 5 }); if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true }); });

describe("Manual podcast Facebook delivery", () => {
  async function episode(status: "draft" | "published" = "published", publishedAt = new Date(Date.now() - 1000)) {
    const [row] = await db.insert(schema.podcasts).values({ title: "Изричен тестов подкаст", slug: `test-${randomUUID()}`, summary: "Кратко запазено резюме за изолирания тест.",
      coverKey: "podcasts/2026/10/12ab-cd34.webp", audioKey: "podcasts/2026/10/12ab-cd34.mp3", durationSec: 60, bytes: 1024,
      status, publishedAt: status === "published" ? publishedAt : null }).returning();
    return row!;
  }
  const podcastJob = async (id: string) => (await db.select({ job: schema.socialPublications }).from(schema.podcastSocialPublications)
    .innerJoin(schema.socialPublications, eq(schema.socialPublications.id, schema.podcastSocialPublications.jobId))
    .where(eq(schema.podcastSocialPublications.podcastId, id)))[0]!.job;
  const deps = (remote = makeApi()) => ({ makeClient: remote as unknown as MakeSocialClient, photo: async () => Buffer.from("explicit isolated photo") });
  async function queuedPhoto() {
    useMake(); const row = await episode(); await sharePodcastToFacebook(db, row.id, 1);
    await db.update(schema.socialPublications).set({ step: "photo" }).where(eq(schema.socialPublications.id, (await podcastJob(row.id)).id));
    return row;
  }
  it("queues exactly one durable job per episode and target from saved copy", async () => {
    useMake(); const row = await episode();
    expect((await readPodcastSocialStatus(db, row.id)).job).toBeNull();
    const first = await sharePodcastToFacebook(db, row.id, 1);
    const again = await sharePodcastToFacebook(db, row.id, 1);
    expect(first.job?.id).toBe(again.job?.id);
    expect(await db.select().from(schema.socialPublications)).toHaveLength(1);
    expect(await podcastJob(row.id)).toMatchObject({ articleId: null, revision: 1, storageKey: row.coverKey, status: "pending",
      articleUrl: `https://site44159-izdo3c.scloudsite101.com/livepoint/podcast/${row.slug}/` });
    expect(first.job?.text).toContain(row.title); expect(first.job?.text).toContain(row.summary);
    expect(first.job?.text).not.toContain("https://");
    expect(JSON.stringify(first)).not.toContain("fixture-key"); expect(JSON.stringify(first)).not.toContain("hook.eu2.make.com");
  });
  it("rejects draft, future, stale, missing or disabled requests before enqueuing", async () => {
    useMake(); const draft = await episode("draft"), future = await episode("published", new Date(Date.now() + 60000)), row = await episode();
    await expect(sharePodcastToFacebook(db, draft.id, 1)).rejects.toMatchObject({ code: "not_public" });
    await expect(sharePodcastToFacebook(db, future.id, 1)).rejects.toMatchObject({ code: "not_public" });
    await expect(sharePodcastToFacebook(db, row.id, 2)).rejects.toMatchObject({ code: "revision_conflict" });
    await expect(sharePodcastToFacebook(db, randomUUID(), 1)).rejects.toMatchObject({ status: 404 });
    await expect(readPodcastSocialStatus(db, randomUUID())).rejects.toMatchObject({ status: 404 });
    vi.stubEnv("SOCIAL_PUBLISHING_ENABLED", "0");
    await expect(sharePodcastToFacebook(db, row.id, 1)).rejects.toMatchObject({ code: "disabled" });
    vi.stubEnv("SOCIAL_PUBLISHING_ENABLED", "1"); vi.stubEnv("MAKE_SOCIAL_WEBHOOK_API_KEY", "");
    await expect(sharePodcastToFacebook(db, row.id, 1)).rejects.toMatchObject({ code: "connection" });
    expect(await db.select().from(schema.socialPublications)).toHaveLength(0);
  });
  it.runIf(real)("serializes simultaneous podcast clicks on independent PostgreSQL connections", async () => {
    useMake(); const row = await episode();
    const results = await Promise.all([sharePodcastToFacebook(db, row.id, 1), sharePodcastToFacebook(db, row.id, 1)]);
    expect(results[0]!.job?.id).toBe(results[1]!.job?.id);
    expect(await db.select().from(schema.socialPublications)).toHaveLength(1);
    expect(await db.select().from(schema.podcastSocialPublications)).toHaveLength(1);
  });
  it("keeps the queued cover, title, caption and URL stable when the saved episode changes", async () => {
    useMake(); const row = await episode(); await sharePodcastToFacebook(db, row.id, 1);
    await db.update(schema.podcasts).set({ title: "По-късно заглавие", summary: "Редактирано резюме", coverKey: "podcasts/2026/10/abcd-9999.webp", revision: 2 }).where(eq(schema.podcasts.id, row.id));
    const remote = makeApi(); await processSocialJob(db, (await claimSocialJob(db))!, deps(remote));
    const job = await podcastJob(row.id);
    expect(job).toMatchObject({ status: "pending", step: "photo", revision: 1, storageKey: row.coverKey });
    expect(job.text).toContain(row.summary); expect(job.text).not.toContain("Редактирано");
    const prepared = await readFile(resolve(fixtureRoot, "private", job.preparedFile!));
    const expected = await renderFacebookPostImage(await readFile(resolve(fixtureRoot, "media", row.coverKey)), row.title);
    expect(prepared.equals(expected)).toBe(true); expect(remote.publish).not.toHaveBeenCalled();
    await processSocialJob(db, (await claimSocialJob(db))!, deps(remote));
    expect(remote.publish).toHaveBeenCalledTimes(1);
    expect(remote.publish.mock.calls[0]?.[0]).toMatchObject({ message: job.text, articleUrl: job.articleUrl });
    expect((await sharePodcastToFacebook(db, row.id, 2)).job?.status).toBe("succeeded");
    expect(await claimSocialJob(db)).toBeNull();
  });
  it("resumes only the comment after a known partial Make success", async () => {
    const row = await queuedPhoto(); const remote = makeApi();
    remote.publish.mockRejectedValueOnce(new MakeSocialError("comment_failed", true, false, "11_22"));
    await processSocialJob(db, (await claimSocialJob(db))!, deps(remote));
    expect(await podcastJob(row.id)).toMatchObject({ status: "retry", step: "comment", postId: "11_22" });
    await db.update(schema.socialPublications).set({ nextAttemptAt: new Date(0) });
    await processSocialJob(db, (await claimSocialJob(db))!, deps(remote));
    expect(remote.publish).toHaveBeenCalledTimes(1); expect(remote.comment).toHaveBeenCalledTimes(1);
    expect(remote.comment.mock.calls[0]?.[0]).toMatchObject({ articleUrl: (await podcastJob(row.id)).articleUrl, postId: "11_22" });
    expect((await readPodcastSocialStatus(db, row.id)).job?.status).toBe("succeeded");
  });
  it("never reposts an uncertain result, including another share click or retry", async () => {
    const row = await queuedPhoto(); const remote = makeApi(); remote.publish.mockRejectedValueOnce(new MakeSocialError("lost_response", true, true));
    await processSocialJob(db, (await claimSocialJob(db))!, deps(remote));
    expect((await sharePodcastToFacebook(db, row.id, 1)).job).toMatchObject({ status: "uncertain", canRetry: false });
    await expect(sharePodcastToFacebook(db, row.id, 1, "retry")).rejects.toMatchObject({ code: "not_retryable" });
    await db.update(schema.socialPublications).set({ nextAttemptAt: new Date(0) });
    await processSocialJob(db, (await claimSocialJob(db))!, deps(remote));
    expect(remote.publish).toHaveBeenCalledTimes(1); expect(remote.comment).not.toHaveBeenCalled();
  });
  it("refreshes a failed pre-send snapshot only on an explicit retry", async () => {
    useMake(); const row = await episode(); await sharePodcastToFacebook(db, row.id, 1);
    await db.update(schema.socialPublications).set({ status: "failed", errorCode: "image" });
    await db.update(schema.podcasts).set({ title: "Обновен тестов подкаст", revision: 2 }).where(eq(schema.podcasts.id, row.id));
    expect((await sharePodcastToFacebook(db, row.id, 2)).job).toMatchObject({ status: "failed", canRetry: true });
    const retry = await sharePodcastToFacebook(db, row.id, 2, "retry");
    expect(retry.job).toMatchObject({ status: "pending", step: "prepare" });
    expect((await podcastJob(row.id)).revision).toBe(2); expect(retry.job?.text).toContain("Обновен тестов подкаст");
  });
  it("cancels hidden or deleted episodes before contacting Facebook", async () => {
    const remote = makeApi();
    for (const remove of [false, true]) {
      const row = await queuedPhoto();
      const job = (await claimSocialJob(db))!;
      if (remove) await db.delete(schema.podcasts).where(eq(schema.podcasts.id, row.id));
      else await db.update(schema.podcasts).set({ status: "draft" }).where(eq(schema.podcasts.id, row.id));
      await processSocialJob(db, job, deps(remote));
      expect((await db.select().from(schema.socialPublications).where(eq(schema.socialPublications.id, job.id)))[0]?.status).toBe("cancelled");
    }
    expect(remote.publish).not.toHaveBeenCalled(); expect(remote.comment).not.toHaveBeenCalled();
  });
  it("rechecks publication after photo preparation immediately before the external write", async () => {
    const row = await queuedPhoto(); const remote = makeApi();
    await processSocialJob(db, (await claimSocialJob(db))!, { ...deps(remote), photo: async () => {
      await db.update(schema.podcasts).set({ status: "draft" }).where(eq(schema.podcasts.id, row.id)); return Buffer.from("isolated photo");
    } });
    expect(remote.publish).not.toHaveBeenCalled();
  });
  it("does not widen the article photo allowlist to podcast or private audio files", async () => {
    const row = await queuedPhoto(); const job = await podcastJob(row.id);
    await expect(prepareSocialPhoto(job, row.title)).rejects.toMatchObject({ code: "image" });
    await expect(prepareSocialPhoto({ ...job, storageKey: "ai-podcasts/2026/10/12ab.webp" }, row.title, "podcast")).rejects.toMatchObject({ code: "image" });
    await expect(prepareSocialPhoto({ ...job, storageKey: row.audioKey }, row.title, "podcast")).rejects.toMatchObject({ code: "image" });
  });
  it("fails closed without migration 50 while article jobs continue to work", async () => {
    const migration = readFileSync("packages/db/migrations/50_podcast_social_publishing.sql", "utf8");
    await db.execute(sql`drop table podcast_social_publications`);
    try {
      useMake(); const row = await episode();
      expect(await hasPodcastSocialPublishing(db)).toBe(false);
      expect(await readPodcastSocialStatus(db, row.id)).toMatchObject({ ready: false, job: null });
      await expect(sharePodcastToFacebook(db, row.id, 1)).rejects.toMatchObject({ code: "migration_required" });
      const articleId = await makeJob(); const remote = makeApi();
      await processSocialJob(db, (await claimSocialJob(db))!, deps(remote));
      expect((await jobFor(articleId)).status).toBe("succeeded"); expect(remote.publish).toHaveBeenCalledTimes(1);
    } finally { if (pg) await pg.exec(migration); else await client!.unsafe(migration); }
  });
});

describe(real ? "Facebook on actual PostgreSQL" : "Facebook isolated database flow", () => {
  it("persists custom text through save/reopen/history and preserves it for older clients", async () => {
    const draft = input(); const created = await createArticle(actor, draft);
    expect((await getEditorArticle(created.id))?.draft.social).toEqual(draft.social);
    const { social: _omitted, ...olderClient } = draft;
    await saveRevision(actor, created.id, 1, { ...olderClient, title: "Changed title" });
    expect((await getEditorArticle(created.id))?.draft.social).toEqual(draft.social);
    expect((await listRevisionHistory(created.id)).revisions[0]?.draft.social).toEqual(draft.social);
    await expect(saveRevision(actor, created.id, 1, draft)).rejects.toMatchObject({ code: "conflict", details: { draft: { social: draft.social } } });
  });
  it("normalizes automatic text server-side and binds creation idempotency to social settings", async () => {
    const draft = { ...input(), creationId: randomUUID(), social: { facebook: { ...defaultSocial("Wrong").facebook, enabled: true } } };
    const created = await createArticle(actor, draft);
    expect((await readRevisionSocial(db, created.id, 1, draft.title)).facebook.text).toContain(draft.title);
    await expect(createArticle(actor, { ...draft, social: { facebook: { enabled: false, text: "different", textMode: "custom" } } })).rejects.toMatchObject({ code: "creation_id_reused" });
  });
  it("enqueues once on publish and never duplicates on later updates or HTTP retries", async () => {
    const draft = input(); const created = await createArticle(actor, draft); const key = randomUUID();
    await publishRevision(actor, created.id, 1, key, false); await publishRevision(actor, created.id, 1, key, false);
    await saveRevision(actor, created.id, 1, { ...draft, title: "Updated title" }); await publishRevision(actor, created.id, 2, randomUUID(), false);
    const jobs = await db.select().from(schema.socialPublications); expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ revision: 1, text: draft.social.facebook.text, articleUrl: `https://site44159-izdo3c.scloudsite101.com/${draft.slug}/` });
  });
  it("does not enqueue unchecked or explicit QA publications", async () => {
    for (const draft of [{ ...input(), social: defaultSocial() }, { ...input(), title: "Explicit QA fixture", slug: `qa-editor-excluded-${randomUUID()}` }]) {
      const created = await createArticle(actor, draft);
      if (draft.slug.startsWith("qa-editor-")) await db.insert(schema.editorQaArticles).values({ articleId: created.id, runId: "excluded" });
      if (draft.slug.startsWith("qa-editor-")) {
        await db.update(schema.articleRevisions).set({ title: "[QA editor] excluded" }).where(eq(schema.articleRevisions.articleId, created.id));
      }
      await publishRevision(actor, created.id, 1, randomUUID(), false);
    }
    expect(await db.select().from(schema.socialPublications)).toHaveLength(0);
  });
  it("enqueues the scheduled revision in the same publication transaction", async () => {
    const draft = input(); const created = await createArticle(actor, draft);
    await db.update(schema.articles).set({ scheduledPublishAt: new Date(Date.now() - 10000) }).where(eq(schema.articles.id, created.id));
    expect(await publishDueScheduled(db, created.id)).toBe(1);
    expect(await jobFor(created.id)).toMatchObject({ revision: 1, text: draft.social.facebook.text });
    expect(await publishDueScheduled(db, created.id)).toBe(0);
  });
  it("rolls the publication back when the durable social intent cannot be committed", async () => {
    const created = await createArticle(actor, input());
    await db.execute(sql`create function reject_social_fixture() returns trigger language plpgsql as $$ begin raise exception 'Explicit isolated queue failure'; end $$`);
    await db.execute(sql`create trigger reject_social_fixture before insert on social_publications for each row execute function reject_social_fixture()`);
    try {
      await expect(publishRevision(actor, created.id, 1, randomUUID(), false)).rejects.toThrow();
      expect((await getEditorArticle(created.id))?.isPublic).toBe(false);
      expect(await db.select().from(schema.socialPublications)).toHaveLength(0);
      expect(await db.select().from(schema.publishRequests).where(eq(schema.publishRequests.articleId, created.id))).toHaveLength(0);
    } finally {
      await db.execute(sql`drop trigger reject_social_fixture on social_publications`); await db.execute(sql`drop function reject_social_fixture()`);
    }
  });
  it("commits the article even with missing image/token and repairs only the unsent task", async () => {
    await db.delete(schema.socialConnections); const draft = { ...input(), heroMediaId: null, heroEmbedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };
    const created = await createArticle(actor, draft); await publishRevision(actor, created.id, 1, randomUUID(), false);
    expect((await getEditorArticle(created.id))?.isPublic).toBe(true); expect(await jobFor(created.id)).toMatchObject({ status: "failed", errorCode: "image" });
    await db.insert(schema.socialConnections).values({ provider: "facebook", pageId: "11", name: "fixture", encryptedToken: "fixture", status: "connected" });
    await saveRevision(actor, created.id, 1, { ...draft, heroMediaId: mediaId, heroEmbedUrl: null }); await publishRevision(actor, created.id, 2, randomUUID(), false);
    expect(await db.select().from(schema.socialPublications)).toHaveLength(1);
    expect(await retrySocialPublication(db, created.id)).toBe(true); expect(await jobFor(created.id)).toMatchObject({ status: "pending", pageId: "11", revision: 2, mediaId });
  });
  it("prepares a real private JPEG from disk without HTTP image fetching", async () => {
    const id = await makeJob("prepare"); const job = await jobFor(id);
    const original = await readFile(resolve(fixtureRoot, "media/news/2026/10/fixture.webp"));
    const prepared = await prepareSocialPhoto(job, input().title);
    const bytes = await readFile(resolve(fixtureRoot, "private", prepared.preparedFile)); const info = await sharp(bytes).metadata();
    expect(info).toMatchObject({ format: "jpeg", width: 1200, height: 900 }); expect(bytes.length).toBeLessThan(4 * 1024 * 1024);
    expect(await readFile(resolve(fixtureRoot, "media/news/2026/10/fixture.webp"))).toEqual(original);
    expect(prepared.preparedHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(prepareSocialPhoto({ ...job, storageKey: "news/../../secret" }, input().title)).rejects.toMatchObject({ code: "image" });
  });
  it("brands the image with the queued publication revision headline, not a newer edit or custom caption", async () => {
    const id = await makeJob("prepare");
    const first = await jobFor(id);
    const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
    await saveRevision(actor, id, 1, { ...input(), slug: article!.slug, title: "A later isolated test headline", social: { facebook: { enabled: true, text: "A later custom caption", textMode: "custom" } } });
    await publishRevision(actor, id, 2, randomUUID(), false);
    const remote = api();
    await processSocialJob(db, (await claimSocialJob(db))!, { client: remote as unknown as FacebookClient });
    const prepared = await jobFor(id);
    expect(prepared).toMatchObject({ revision: first.revision, status: "pending", step: "photo" });
    const original = await readFile(resolve(fixtureRoot, "media/news/2026/10/fixture.webp"));
    const expected = await renderFacebookPostImage(original, input().title);
    expect(await readFile(resolve(fixtureRoot, "private", prepared.preparedFile!))).toEqual(expected);
    expect(remote.uploadPhoto).not.toHaveBeenCalled();
  });
  it("checkpoints the photo, retries only a rejected comment and keeps the article public", async () => {
    const id = await makeJob(); const remote = api();
    const deps = { client: remote as unknown as FacebookClient, photo: async () => Buffer.from("explicit fixture bytes") };
    await processSocialJob(db, (await claimSocialJob(db))!, deps);
    expect(await jobFor(id)).toMatchObject({ photoId: "22", postId: "11_22", step: "resolve" });
    await processSocialJob(db, (await claimSocialJob(db))!, deps);
    remote.comment.mockRejectedValueOnce(new FacebookError("rate_limit", true));
    await processSocialJob(db, (await claimSocialJob(db))!, deps);
    expect(await jobFor(id)).toMatchObject({ step: "comment", status: "retry" });
    await db.update(schema.socialPublications).set({ nextAttemptAt: new Date(0) });
    await processSocialJob(db, (await claimSocialJob(db))!, deps);
    expect(await jobFor(id)).toMatchObject({ status: "succeeded", commentId: "22_33" });
    expect(remote.uploadPhoto).toHaveBeenCalledTimes(1); expect(remote.comment).toHaveBeenCalledTimes(2);
    expect((await getEditorArticle(id))?.isPublic).toBe(true);
  });
  it("does not repeat a photo after an ambiguous response, even on editor retry", async () => {
    const id = await makeJob(); const remote = api(); remote.uploadPhoto.mockRejectedValue(new FacebookError("transport", true, true));
    const deps = { client: remote as unknown as FacebookClient, photo: async () => Buffer.from("fixture") };
    await processSocialJob(db, (await claimSocialJob(db))!, deps);
    expect(await jobFor(id)).toMatchObject({ status: "uncertain", step: "photo" });
    expect(await retrySocialPublication(db, id)).toBe(false);
    await db.update(schema.socialPublications).set({ nextAttemptAt: new Date(0) });
    await processSocialJob(db, (await claimSocialJob(db))!, deps);
    expect(remote.uploadPhoto).toHaveBeenCalledTimes(1); expect(remote.comment).not.toHaveBeenCalled();
  });
  it("reconciles an accepted comment with a lost response without another POST", async () => {
    const id = await makeJob("comment"); await db.update(schema.socialPublications).set({ postId: "11_22", status: "uncertain" });
    const job = await jobFor(id); const remote = api(); remote.comments.mockResolvedValue([{ id: "22_33", from: { id: "11" }, message: job.articleUrl }]);
    await processSocialJob(db, (await claimSocialJob(db))!, { client: remote as unknown as FacebookClient });
    expect(await jobFor(id)).toMatchObject({ status: "succeeded", commentId: "22_33" }); expect(remote.comment).not.toHaveBeenCalled();
  });
  it("recovers a crashed sender as uncertain and fences an obsolete worker", async () => {
    const id = await makeJob(); const old = (await claimSocialJob(db))!;
    await db.update(schema.socialPublications).set({ status: "sending", leaseUntil: new Date(0), operationStartedAt: new Date() });
    const newer = (await claimSocialJob(db))!; expect(newer.status).toBe("uncertain"); expect(newer.leaseToken).not.toBe(old.leaseToken);
    const remote = api(); await processSocialJob(db, old, { client: remote as unknown as FacebookClient, photo: async () => Buffer.from("fixture") });
    expect(remote.uploadPhoto).not.toHaveBeenCalled(); expect((await jobFor(id)).leaseToken).toBe(newer.leaseToken);
  });
  it("does not send hidden articles or when globally disabled", async () => {
    const id = await makeJob(); const remote = api(); const deps = { client: remote as unknown as FacebookClient, photo: async () => Buffer.from("fixture") };
    vi.stubEnv("SOCIAL_PUBLISHING_ENABLED", "0"); await processSocialJob(db, (await claimSocialJob(db))!, deps); expect(remote.uploadPhoto).not.toHaveBeenCalled();
    await db.update(schema.socialPublications).set({ nextAttemptAt: new Date(0) }); await db.update(schema.articles).set({ isPublic: false }).where(eq(schema.articles.id, id));
    vi.stubEnv("SOCIAL_PUBLISHING_ENABLED", "1"); await processSocialJob(db, (await claimSocialJob(db))!, deps);
    expect(await jobFor(id)).toMatchObject({ status: "cancelled" }); expect(remote.uploadPhoto).not.toHaveBeenCalled();
  });
  it("does not invalidate a replacement credential after an obsolete sender gets an auth error", async () => {
    await makeJob(); const remote = api();
    remote.uploadPhoto.mockImplementation(async () => {
      await db.update(schema.socialConnections).set({ generation: 2 }); throw new FacebookError("connection");
    });
    await processSocialJob(db, (await claimSocialJob(db))!, { client: remote as unknown as FacebookClient, photo: async () => Buffer.from("fixture") });
    expect((await db.select().from(schema.socialConnections))[0]).toMatchObject({ generation: 2, status: "connected" });
  });
  it("publishes the photo and first comment through Make in one checkpoint", async () => {
    useMake(); const id = await makeJob(); const remote = makeApi();
    await processSocialJob(db, (await claimSocialJob(db))!, { makeClient: remote as unknown as MakeSocialClient, photo: async () => Buffer.from("fixture") });
    expect(await jobFor(id)).toMatchObject({ status: "succeeded", postId: "11_22", commentId: "22_33" });
    expect(remote.publish).toHaveBeenCalledTimes(1); expect(remote.comment).not.toHaveBeenCalled();
  });
  it("checkpoints a Make post and retries only its failed comment", async () => {
    useMake(); const id = await makeJob(); const remote = makeApi();
    remote.publish.mockRejectedValueOnce(new MakeSocialError("comment_failed", true, false, "11_22"));
    const deps = { makeClient: remote as unknown as MakeSocialClient, photo: async () => Buffer.from("fixture") };
    await processSocialJob(db, (await claimSocialJob(db))!, deps);
    expect(await jobFor(id)).toMatchObject({ status: "retry", step: "comment", postId: "11_22" });
    await db.update(schema.socialPublications).set({ nextAttemptAt: new Date(0) });
    await processSocialJob(db, (await claimSocialJob(db))!, deps);
    expect(await jobFor(id)).toMatchObject({ status: "succeeded", commentId: "22_33" });
    expect(remote.publish).toHaveBeenCalledTimes(1); expect(remote.comment).toHaveBeenCalledTimes(1);
  });
  it("does not repeat a Make publish after a lost response", async () => {
    useMake(); const id = await makeJob(); const remote = makeApi(); remote.publish.mockRejectedValueOnce(new MakeSocialError("lost_response", true, true));
    const deps = { makeClient: remote as unknown as MakeSocialClient, photo: async () => Buffer.from("fixture") };
    await processSocialJob(db, (await claimSocialJob(db))!, deps);
    expect(await jobFor(id)).toMatchObject({ status: "uncertain", step: "photo" });
    await db.update(schema.socialPublications).set({ nextAttemptAt: new Date(0) });
    await processSocialJob(db, (await claimSocialJob(db))!, deps);
    expect(remote.publish).toHaveBeenCalledTimes(1);
  });
  it("retries a Make failure declared before publication", async () => {
    useMake(); const id = await makeJob(); const remote = makeApi(); remote.publish.mockRejectedValueOnce(new MakeSocialError("busy", true, false));
    const deps = { makeClient: remote as unknown as MakeSocialClient, photo: async () => Buffer.from("fixture") };
    await processSocialJob(db, (await claimSocialJob(db))!, deps); expect(await jobFor(id)).toMatchObject({ status: "retry", step: "photo" });
    await db.update(schema.socialPublications).set({ nextAttemptAt: new Date(0) }); await processSocialJob(db, (await claimSocialJob(db))!, deps);
    expect(await jobFor(id)).toMatchObject({ status: "succeeded" }); expect(remote.publish).toHaveBeenCalledTimes(2);
  });
  it("does not send a hidden article through Make", async () => {
    useMake(); const id = await makeJob(); const remote = makeApi(); await db.update(schema.articles).set({ isPublic: false }).where(eq(schema.articles.id, id));
    await processSocialJob(db, (await claimSocialJob(db))!, { makeClient: remote as unknown as MakeSocialClient, photo: async () => Buffer.from("fixture") });
    expect(await jobFor(id)).toMatchObject({ status: "cancelled" }); expect(remote.publish).not.toHaveBeenCalled();
  });
  it("shows the configured Make Page without exposing webhook secrets or allowing Meta OAuth actions", async () => {
    useMake();
    const settings = await facebookSettings(admin);
    expect(settings).toMatchObject({
      ready: true,
      provider: "make",
      connection: { pageId: "11", name: "News Point", status: "connected" },
      pages: [],
    });
    const serialized = JSON.stringify(settings);
    expect(serialized).not.toContain("hook.eu2.make.com");
    expect(serialized).not.toContain("fixture-key");
    await expect(startFacebookConnection(admin)).rejects.toMatchObject({ code: "provider" });
    await expect(disconnectFacebook(admin)).rejects.toMatchObject({ code: "provider" });
  });
  it("restricts connection management to master_admin and never returns encrypted tokens", async () => {
    await expect(facebookSettings(actor)).rejects.toMatchObject({ status: 403 });
    const settings = await facebookSettings(admin); expect(JSON.stringify(settings)).not.toContain("not-a-live-token");
    await disconnectFacebook(admin); expect((await db.select().from(schema.socialConnections))[0]).toMatchObject({ encryptedToken: "", status: "disconnected" });
  });
  it("consumes consent selection once, encrypts the token and reconnects only the same Page", async () => {
    const selection = "a".repeat(43);
    await db.insert(schema.socialOauthStates).values({ id: selection, actorId: actor.id, phase: "select", redirectUri: "fixture", expiresAt: new Date(Date.now() + 60000),
      encryptedPages: encryptSocialSecret(JSON.stringify({ userId: "999", pages: [{ id: "11", name: "QA Page", access_token: "explicit-fixture-token", tasks: ["MANAGE"] }] }), `facebook-oauth:${selection}:${actor.id}`) });
    await selectFacebookPage(admin, selection, "11"); const [connection] = await db.select().from(schema.socialConnections);
    expect(connection).toMatchObject({ status: "connected", metaUserId: "999" }); expect(connection!.encryptedToken).not.toContain("explicit-fixture-token");
    await expect(selectFacebookPage(admin, selection, "11")).rejects.toMatchObject({ code: "oauth_state" });
  });
  it("requests the configured Business Login code grant without leaking secrets or mixing scopes", async () => {
    vi.stubEnv("META_APP_SECRET", "explicit-business-login-secret");
    vi.stubEnv("META_LOGIN_CONFIG_ID", "456");
    vi.stubEnv("META_GRAPH_API_VERSION", "v26.0");
    const { url: location } = await startFacebookConnection(admin);
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "123", config_id: "456", response_type: "code", override_default_response_type: "true",
      redirect_uri: "https://site44159-izdo3c.scloudsite101.com/admin/api/social/callback/",
    });
    expect(url.searchParams.has("scope")).toBe(false);
    expect(location).not.toContain("explicit-business-login-secret");
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [pending] = await db.select().from(schema.socialOauthStates);
    expect(pending).toMatchObject({ id: url.searchParams.get("state"), actorId: admin.id, phase: "authorize", redirectUri: url.searchParams.get("redirect_uri") });
    expect(pending!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(pending!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 600_000);
  });
  it("uses the configured callback, consumes OAuth state once and never returns Page tokens to settings", async () => {
    vi.stubEnv("META_APP_SECRET", "explicit-oauth-fixture"); vi.stubEnv("META_LOGIN_CONFIG_ID", "");
    const started = await startFacebookConnection(admin); const url = new URL(started.url);
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.has("config_id")).toBe(false);
    expect(url.searchParams.has("override_default_response_type")).toBe(false);
    expect(url.searchParams.get("scope")?.split(",")).toEqual(["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_manage_engagement"]);
    expect(url.searchParams.get("redirect_uri")).toBe("https://site44159-izdo3c.scloudsite101.com/admin/api/social/callback/");
    const state = url.searchParams.get("state")!;
    const remote = vi.fn<typeof fetch>().mockImplementation(async target => {
      const path = new URL(String(target)).pathname;
      if (path.endsWith("/oauth/access_token")) return Response.json({ access_token: "explicit-user-token" });
      if (path.endsWith("/me/permissions")) return Response.json({ data: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_manage_engagement"].map(permission => ({ permission, status: "granted" })) });
      if (path.endsWith("/me/accounts")) return Response.json({ data: [{ id: "11", name: "QA page", access_token: "secret-page-fixture", tasks: ["MANAGE"] }] });
      if (path.endsWith("/me")) return Response.json({ id: "999" });
      throw new Error("Unexpected fixture request");
    }); vi.stubGlobal("fetch", remote);
    await expect(finishFacebookConnection(actor, state, "code")).rejects.toMatchObject({ status: 403 });
    const selection = await finishFacebookConnection(admin, state, "code");
    const settings = await facebookSettings(admin, selection); expect(settings.pages).toEqual([{ id: "11", name: "QA page" }]);
    expect(JSON.stringify(settings)).not.toContain("secret-page-fixture");
    const [stored] = await db.select().from(schema.socialOauthStates); expect(stored?.encryptedPages).not.toContain("secret-page-fixture");
    const calls = remote.mock.calls.length;
    await expect(finishFacebookConnection(admin, state, "code")).rejects.toMatchObject({ code: "oauth_state" }); expect(remote.mock.calls).toHaveLength(calls);
    await db.update(schema.socialOauthStates).set({ expiresAt: new Date(0) });
    await expect(selectFacebookPage(admin, selection, "11")).rejects.toMatchObject({ code: "oauth_state" });
  });
  it("rejects forged/expired OAuth state before any provider call and supports the official callback", async () => {
    vi.stubEnv("META_APP_SECRET", "fixture"); vi.stubEnv("STUDIO_PUBLIC_URL", "https://newspoint.bg/admin");
    const remote = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", remote);
    const url = new URL((await startFacebookConnection(admin)).url); const state = url.searchParams.get("state")!;
    expect(url.searchParams.get("redirect_uri")).toBe("https://newspoint.bg/admin/api/social/callback/");
    await expect(finishFacebookConnection(admin, "x".repeat(43), "code")).rejects.toMatchObject({ code: "oauth_state" });
    await db.update(schema.socialOauthStates).set({ expiresAt: new Date(0) });
    await expect(finishFacebookConnection(admin, state, "code")).rejects.toMatchObject({ code: "oauth_state" }); expect(remote).not.toHaveBeenCalled();
  });
  it("removes only the matching Meta authorization on signed deletion and returns a private receipt", async () => {
    vi.stubEnv("META_APP_SECRET", "explicit-delete-fixture");
    await db.update(schema.socialConnections).set({ metaUserId: "999", connectedBy: actor.id });
    const selection = "z".repeat(43);
    await db.insert(schema.socialOauthStates).values({ id: selection, actorId: actor.id, phase: "select", redirectUri: "fixture", expiresAt: new Date(Date.now() + 60000),
      encryptedPages: encryptSocialSecret(JSON.stringify({ userId: "999", pages: [] }), `facebook-oauth:${selection}:${actor.id}`) });
    const sign = (id: string) => { const payload = Buffer.from(JSON.stringify({ user_id: id, algorithm: "HMAC-SHA256", issued_at: Date.now() / 1000 })).toString("base64url"); return `${createHmac("sha256", "explicit-delete-fixture").update(payload).digest("base64url")}.${payload}`; };
    await expect(removeFacebookAuthorization("forged")).rejects.toThrow("invalid_signed_request");
    await removeFacebookAuthorization(sign("888")); expect((await db.select().from(schema.socialConnections))[0]?.status).toBe("connected");
    expect(await db.select().from(schema.socialOauthStates).where(eq(schema.socialOauthStates.id, selection))).toHaveLength(1);
    const receipt = await removeFacebookAuthorization(sign("999"));
    expect(receipt.url).toContain("/admin/api/social/deletion-status/?code=");
    expect((await db.select().from(schema.socialConnections))[0]).toMatchObject({ encryptedToken: "", metaUserId: null, status: "disconnected" });
    expect(await db.select().from(schema.socialDeletionReceipts).where(eq(schema.socialDeletionReceipts.id, receipt.confirmation_code))).toHaveLength(1);
  });
  it.runIf(real)("serializes two simultaneous publications and claims on independent connections", async () => {
    const draft = input(); const created = await createArticle(actor, draft);
    await Promise.all([publishRevision(actor, created.id, 1, randomUUID(), false), publishRevision(actor, created.id, 1, randomUUID(), false)]);
    expect(await db.select().from(schema.socialPublications)).toHaveLength(1);
    const claims = await Promise.all([claimSocialJob(db), claimSocialJob(db)]); expect(claims.filter(Boolean)).toHaveLength(1);
  });
});

// Real domain operations in an isolated database; HTTP is explicitly simulated.
describe("Instagram independent editorial delivery",()=>{
  function configure(){
    vi.stubEnv("INSTAGRAM_PUBLISHING_ENABLED","1");vi.stubEnv("MAKE_INSTAGRAM_WEBHOOK_URL","https://hook.eu1.make.com/fixture");
    vi.stubEnv("MAKE_INSTAGRAM_WEBHOOK_API_KEY","private-fixture");vi.stubEnv("MAKE_INSTAGRAM_ACCOUNT_ID","123");vi.stubEnv("MAKE_INSTAGRAM_USERNAME","newspointbg");
  }
  const igInput=()=>({...input(),social:{facebook:{enabled:false,text:"",textMode:"auto" as const},instagram:{enabled:true,text:"Isolated Instagram fixture",textMode:"custom" as const}}});
  const igJob=async(id:string)=>(await db.execute<InstagramJob>(sql`select * from instagram_publications where article_id=${id}::uuid`))[0]!;
  const transport=()=>({publish:vi.fn().mockResolvedValue({postId:"456",permalink:"https://www.instagram.com/p/ExplicitFixture/"})});
  const prepare=async(job:InstagramJob)=>({imageKey:`news/social-instagram/${job.id}-${"a".repeat(64)}.jpg`,imageHash:"a".repeat(64)});

  it("rejects a mismatched derivative checkpoint before contacting Instagram",async()=>{
    const {id}=await published(); const client=transport();
    await processInstagramJob(db,(await claimInstagramJob(db))!,{client,prepare:async job=>({
      imageKey:`news/social-instagram/${job.id}-${"a".repeat(64)}.jpg`,imageHash:"b".repeat(64),
    })});
    expect(client.publish).not.toHaveBeenCalled(); expect(await igJob(id)).toMatchObject({status:"failed",error_code:"image"});
  });
  async function published(){configure();const draft=igInput();const created=await createArticle(actor,draft);await publishRevision(actor,created.id,1,randomUUID(),false);return {id:created.id,draft};}
  it("preserves custom Instagram text across revisions, history and older Facebook-only clients",async()=>{
    configure();const draft=igInput();const created=await createArticle(actor,draft);
    expect((await getEditorArticle(created.id))?.draft.social?.instagram).toEqual(draft.social.instagram);
    const legacy={...draft,social:{facebook:draft.social.facebook}};await saveRevision(actor,created.id,1,legacy);
    expect((await getEditorArticle(created.id))?.draft.social?.instagram).toEqual(draft.social.instagram);
    expect((await listRevisionHistory(created.id)).revisions[0]?.draft.social?.instagram).toEqual(draft.social.instagram);
    expect(await igJob(created.id)).toBeUndefined();
  });
  it("enqueues only Instagram, once, even on later edits and repeated publication",async()=>{
    const {id,draft}=await published();expect(await igJob(id)).toMatchObject({status:"pending",revision:1,caption:draft.social.instagram.text});
    expect(await db.select().from(schema.socialPublications)).toHaveLength(0);
    await saveRevision(actor,id,1,{...draft,title:"Updated isolated title"});await publishRevision(actor,id,2,randomUUID(),false);
    expect(await igJob(id)).toMatchObject({revision:1,title:draft.title});
    const client=transport();await processInstagramJob(db,(await claimInstagramJob(db))!,{client,prepare});
    expect(await igJob(id)).toMatchObject({status:"succeeded",post_id:"456"});expect(client.publish).toHaveBeenCalledTimes(1);
    expect(await claimInstagramJob(db)).toBeNull();expect(await retryInstagramPublication(db,id)).toBe(false);
  });
  it("lets Facebook and Instagram succeed or fail independently",async()=>{
    configure();const draft={...igInput(),social:{...igInput().social,facebook:input().social.facebook}};
    const created=await createArticle(actor,draft);await publishRevision(actor,created.id,1,randomUUID(),false);
    expect(await db.select().from(schema.socialPublications)).toHaveLength(1);
    const client=transport();client.publish.mockRejectedValue(new InstagramError("lost_response",false,true));
    await processInstagramJob(db,(await claimInstagramJob(db))!,{client,prepare});
    expect(await igJob(created.id)).toMatchObject({status:"uncertain"});expect((await jobFor(created.id)).status).toBe("pending");
    expect(await retryInstagramPublication(db,created.id)).toBe(false);expect(await claimInstagramJob(db)).toBeNull();
  });
  it("retries only definite pre-publication failures and refreshes a failed input explicitly",async()=>{
    const {id}=await published();const client=transport();client.publish.mockRejectedValueOnce(new InstagramError("rate_limit",true));
    await processInstagramJob(db,(await claimInstagramJob(db))!,{client,prepare});expect(await igJob(id)).toMatchObject({status:"retry",attempts:1});
    await db.execute(sql`update instagram_publications set next_attempt_at=now()`);
    await processInstagramJob(db,(await claimInstagramJob(db))!,{client,prepare});expect(await igJob(id)).toMatchObject({status:"succeeded"});
  });
  it("holds expired in-flight requests and recovers preparation leases",async()=>{
    const {id}=await published();const first=(await claimInstagramJob(db))!;
    await db.execute(sql`update instagram_publications set lease_until=now()-interval '1 minute'`);
    const second=(await claimInstagramJob(db))!;expect(second.lease_token).not.toBe(first.lease_token);
    const client=transport();await processInstagramJob(db,first,{client,prepare});expect(client.publish).not.toHaveBeenCalled();
    await db.execute(sql`update instagram_publications set status='sending',lease_until=now()-interval '1 minute'`);
    expect(await claimInstagramJob(db)).toBeNull();expect(await igJob(id)).toMatchObject({status:"uncertain"});
  });
  it("cancels hidden/deleted articles and respects the independent switch",async()=>{
    const {id}=await published();vi.stubEnv("INSTAGRAM_PUBLISHING_ENABLED","0");const client=transport();
    await processInstagramJob(db,(await claimInstagramJob(db))!,{client,prepare});expect(client.publish).not.toHaveBeenCalled();
    vi.stubEnv("INSTAGRAM_PUBLISHING_ENABLED","1");await db.execute(sql`update instagram_publications set next_attempt_at=now()`);
    await db.update(schema.articles).set({isPublic:false}).where(eq(schema.articles.id,id));
    await processInstagramJob(db,(await claimInstagramJob(db))!,{client,prepare});expect(await igJob(id)).toMatchObject({status:"cancelled"});
    expect(client.publish).not.toHaveBeenCalled();
  });
  it("renders a separate bounded JPEG and leaves the original unchanged",async()=>{
    const {id}=await published();const job=await igJob(id);const original=await readFile(resolve(fixtureRoot,"media/news/2026/10/fixture.webp"));
    const image=await prepareInstagramPhoto(job);const bytes=await readFile(resolve(fixtureRoot,"media",image.imageKey));
    expect(await sharp(bytes).metadata()).toMatchObject({format:"jpeg",width:1080,height:810});expect(bytes.length).toBeLessThan(4*1024*1024);
    expect(await readFile(resolve(fixtureRoot,"media/news/2026/10/fixture.webp"))).toEqual(original);
    expect(image.imageKey).toMatch(/^news\/social-instagram\//);
  });
  it("fails unconfigured delivery clearly and recovers after connection without a second task",async()=>{
    const draft=igInput();const created=await createArticle(actor,draft);await publishRevision(actor,created.id,1,randomUUID(),false);
    expect(await igJob(created.id)).toMatchObject({status:"failed",error_code:"connection"});configure();
    expect(await retryInstagramPublication(db,created.id)).toBe(true);expect(await igJob(created.id)).toMatchObject({status:"pending",account_id:"123"});
    expect((await readInstagramStatus(db,created.id)).connected).toBe(true);
  });
  it("publishes the scheduled Instagram intent exactly once",async()=>{
    configure();const created=await createArticle(actor,igInput());
    await db.update(schema.articles).set({scheduledPublishAt:new Date(Date.now()-10000)}).where(eq(schema.articles.id,created.id));
    expect(await publishDueScheduled(db,created.id)).toBe(1);expect(await igJob(created.id)).toMatchObject({status:"pending",revision:1});
    expect(await publishDueScheduled(db,created.id)).toBe(0);
  });
  it("does not enqueue unchecked or registered QA articles",async()=>{
    configure();const unchecked=igInput();unchecked.social.instagram.enabled=false;
    const first=await createArticle(actor,unchecked);await publishRevision(actor,first.id,1,randomUUID(),false);
    const second=await createArticle(actor,igInput());await db.insert(schema.editorQaArticles).values({articleId:second.id,runId:"isolated-instagram-qa"});
    await publishRevision(actor,second.id,1,randomUUID(),false);
    expect(await db.execute(sql`select id from instagram_publications`)).toHaveLength(0);
  });
  it("rolls publication back if its durable Instagram task cannot be saved",async()=>{
    configure();const created=await createArticle(actor,igInput());
    await db.execute(sql`create function reject_instagram_fixture() returns trigger language plpgsql as $$ begin raise exception 'Isolated queue failure'; end $$`);
    await db.execute(sql`create trigger reject_instagram_fixture before insert on instagram_publications for each row execute function reject_instagram_fixture()`);
    try{await expect(publishRevision(actor,created.id,1,randomUUID(),false)).rejects.toThrow();expect((await getEditorArticle(created.id))?.isPublic).toBe(false);expect(await igJob(created.id)).toBeUndefined();}
    finally{await db.execute(sql`drop trigger reject_instagram_fixture on instagram_publications`);await db.execute(sql`drop function reject_instagram_fixture()`);}
  });
  it("checks visibility again after image preparation before any external write",async()=>{
    const {id}=await published();const client=transport();
    await processInstagramJob(db,(await claimInstagramJob(db))!,{client,prepare:async job=>{
      await db.update(schema.articles).set({isPublic:false}).where(eq(schema.articles.id,id));return prepare(job);
    }});
    expect(client.publish).not.toHaveBeenCalled();
  });
  it("bounds repeated preparation failures and rejects account changes",async()=>{
    const {id}=await published();const client=transport();
    await db.execute(sql`update instagram_publications set attempts=4`);
    await processInstagramJob(db,(await claimInstagramJob(db))!,{client,prepare:async()=>{throw new Error("isolated renderer failure");}});
    expect(await igJob(id)).toMatchObject({status:"failed",attempts:5});
    vi.stubEnv("MAKE_INSTAGRAM_ACCOUNT_ID","999");expect(await retryInstagramPublication(db,id)).toBe(false);expect(client.publish).not.toHaveBeenCalled();
  });
});
