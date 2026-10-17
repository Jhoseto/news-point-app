import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../../../packages/db/src/schema";
import type { ScriptDb } from "@newspoint/db/node";
import { cancelMediaUpload, checksum, claimMediaUpload, cleanExpiredUploads, completeMediaUpload, createMediaUpload, mediaUploadStatus, ownMediaUpload, putMediaChunk, uploadDirectory, uploadIntent } from "@newspoint/db/media-uploads";
const mocks = vi.hoisted(() => ({ audio: vi.fn(), photo: vi.fn(), video: vi.fn(), write: vi.fn(), writeFromFile: vi.fn(), remove: vi.fn() }));
vi.mock("@newspoint/content/audio", () => ({ preparePodcastAudio: mocks.audio }));
vi.mock("@newspoint/content/upload-media", () => ({ optimizeVideo: mocks.video, prepareUploadedPhoto: mocks.photo, writeMediaFile: mocks.write, writeMediaFromFile: mocks.writeFromFile, removeMediaFile: mocks.remove }));
import { processOneMediaUpload } from "./media-upload-worker";
let engine: PGlite, db: ScriptDb, directory: string;
const editor = "fixture-editor";
const audio = Buffer.from("fixture source"), cover = Buffer.from("fixture photo");
beforeAll(async () => {
 directory = await mkdtemp(resolve(tmpdir(), "np-upload-unit-")); await mkdir(resolve(directory, "media"));
 vi.stubEnv("MEDIA_ROOT", resolve(directory, "media")); vi.stubEnv("MEDIA_UPLOAD_TEMP_ROOT", resolve(directory, "private")); vi.stubEnv("MEDIA_SSH_TARGET", ""); vi.stubEnv("REVALIDATE_SECRET", "");
 engine = new PGlite();
 await engine.exec(`create table staff_users(id text primary key, role text not null); insert into staff_users values ('fixture-editor','editor'),('other','editor');
 create table articles(id uuid primary key default gen_random_uuid(), hero_embed_url text, is_public boolean default false, constraint articles_hero_embed_https_chk check(hero_embed_url is null or hero_embed_url ~ '^https://'));
 create table article_revisions(id uuid primary key default gen_random_uuid(), article_id uuid, hero_embed_url text, constraint article_revisions_hero_embed_https_chk check(hero_embed_url is null or hero_embed_url ~ '^https://'));
 create table podcasts(id uuid primary key default gen_random_uuid(),title text not null,slug text not null,summary text not null,cover_key text not null,audio_key text not null,duration_sec integer not null,bytes integer not null,category_id uuid,status text not null default 'draft',published_at timestamptz,created_by text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
 create table media_assets(id uuid primary key,provider text,storage_key text,mime text,width integer,height integer,alt text,source_url text,caption text default '',credit text default '',wp_id integer,created_at timestamptz default now(),updated_at timestamptz default now());
 create table studio_audit_logs(id uuid primary key,started_at timestamptz,occurred_at timestamptz,actor_id text,actor_name text default '',actor_email text default '',actor_role text,area text,action text,action_label text,entity_kind text,entity_id text,entity_label text,outcome text,method text,path text,status_code integer,duration_ms integer,ip text default '',user_agent text default '',details jsonb,search_text text,target_path text);
 create function pg_advisory_xact_lock(integer,integer) returns void language sql as 'select';`);
 await engine.exec(readFileSync(resolve(process.cwd(), "packages/db/migrations/37_media_upload_sessions.sql"), "utf8"));
 db = drizzle(engine, { schema }) as unknown as ScriptDb;
}, 30000);
afterAll(async () => { await engine?.close(); await rm(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); });
beforeEach(async () => {
 await engine.exec("truncate media_upload_sessions, podcasts, media_assets, studio_audit_logs, articles, article_revisions cascade; insert into staff_users values ('fixture-editor','editor'),('other','editor') on conflict(id) do update set role='editor'");
 for (const fn of Object.values(mocks)) fn.mockReset();
 mocks.write.mockResolvedValue(undefined); mocks.writeFromFile.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined);
 mocks.audio.mockResolvedValue({ buffer: Buffer.from("aac"), extension: "m4a", durationSec: 60, originalBytes: audio.length, optimized: true });
 mocks.photo.mockResolvedValue({ buffer: Buffer.from("webp"), width: 800, height: 600 });
 mocks.video.mockResolvedValue({ duration: 5, width: 1280, height: 720, bytes: 10 });
});
function intent(edit?: { id: string; revision: number }, audioOnly = false) {
 return uploadIntent.parse({ kind: "podcast", files: [{ key: "audio", name: "fixture.wav", bytes: audio.length, type: "audio/wav", sha256: checksum(audio) }, ...(!audioOnly ? [{ key: "cover", name: "fixture.png", bytes: cover.length, type: "image/png", sha256: checksum(cover) }] : [])], metadata: { title: "Fixture episode", summary: "Fixture summary", categoryId: null, publish: false, ...edit } });
}
async function queued(edit?: { id: string; revision: number }, audioOnly = false) {
 const input = intent(edit, audioOnly), row = await createMediaUpload(db, editor, input);
 for (const file of input.files) { const bytes = file.key === "audio" ? audio : cover; await putMediaChunk(db, editor, row.id, file.key, 0, checksum(bytes), bytes); }
 await completeMediaUpload(db, editor, row.id); return row;
}
it("stores one optimized delivery audio and reports stored rather than source bytes", async () => {
 const row = await queued(); await processOneMediaUpload(db); const state = await mediaUploadStatus(db, editor, row.id);
 expect(state.state).toBe("ready"); const result = state.result as any;
 expect(result.episode.audioKey).toMatch(/\.m4a$/); expect(result.episode.bytes).toBe(3); expect(result.audioOptimization).toEqual({ originalBytes: audio.length, storedBytes: 3, savedBytes: audio.length - 3 });
 expect(mocks.write).toHaveBeenCalledTimes(2); expect(mocks.write.mock.calls[1]![1]).toEqual(Buffer.from("aac")); expect(mocks.remove).not.toHaveBeenCalled();
 const episodes = await db.select().from(schema.podcasts); expect(episodes).toHaveLength(1); expect(episodes[0]!.status).toBe("draft");
});
it("completion and worker retries never insert a second episode", async () => {
 const row = await queued(); await completeMediaUpload(db, editor, row.id); await processOneMediaUpload(db); await completeMediaUpload(db, editor, row.id); expect(await processOneMediaUpload(db)).toBe(false); expect(await db.select().from(schema.podcasts)).toHaveLength(1);
});
it("updates audio while preserving existing cover, status and publication date", async () => {
 const first = await queued(); await processOneMediaUpload(db); const [old] = await db.select().from(schema.podcasts);
 await db.update(schema.podcasts).set({ status: "published", publishedAt: new Date("2026-10-01T12:00:00Z") }).where(eq(schema.podcasts.id, old!.id)); mocks.write.mockClear();
 const row = await queued({ id: old!.id, revision: old!.revision }, true); await processOneMediaUpload(db); const state = await mediaUploadStatus(db, editor, row.id); const result = state.result as any;
 expect(result.episode.coverKey).toBe(old!.coverKey); expect(result.episode.status).toBe("published"); expect(result.episode.publishedAt).toBe("2026-10-01T12:00:00.000Z"); expect(result.episode.revision).toBe(2); expect(mocks.write).toHaveBeenCalledTimes(1);
});
it("optimistic revision conflict preserves both episode and only cleans new attempted files", async () => {
 await queued().then(() => processOneMediaUpload(db)); const [old] = await db.select().from(schema.podcasts); const row = await queued({ id: old!.id, revision: old!.revision });
 await db.update(schema.podcasts).set({ revision: 2, title: "Concurrent edit" }).where(eq(schema.podcasts.id, old!.id)); mocks.write.mockClear(); await processOneMediaUpload(db);
 expect((await mediaUploadStatus(db, editor, row.id)).state).toBe("failed"); expect(mocks.write).not.toHaveBeenCalled(); expect((await db.select().from(schema.podcasts))[0]!.title).toBe("Concurrent edit");
});
it("changed content cannot overwrite an idempotent chunk", async () => {
 const row = await createMediaUpload(db, editor, intent()); await putMediaChunk(db, editor, row.id, "audio", 0, checksum(audio), audio);
 expect((await putMediaChunk(db, editor, row.id, "audio", 0, checksum(audio), audio)).duplicate).toBe(true);
 const other = Buffer.alloc(audio.length, 1); await expect(putMediaChunk(db, editor, row.id, "audio", 0, checksum(other), other)).rejects.toMatchObject({ status: 409 });
});
it("rejects incomplete completion, bad digest and malformed owner paths without writing", async () => {
 const row = await createMediaUpload(db, editor, intent()); await expect(completeMediaUpload(db, editor, row.id)).rejects.toMatchObject({ code: "upload_incomplete" });
 await expect(putMediaChunk(db, editor, row.id, "audio", 0, "0".repeat(64), audio)).rejects.toMatchObject({ status: 422 }); await expect(putMediaChunk(db, editor, "bad", "audio", 0, checksum(audio), audio)).rejects.toMatchObject({ status: 404 });
 await expect(ownMediaUpload(db, "other", row.id)).rejects.toMatchObject({ status: 404 });
});
it("enforces two active sessions per owner and releases cancelled reservations", async () => {
 const first = await createMediaUpload(db, editor, intent()); await createMediaUpload(db, editor, intent()); await expect(createMediaUpload(db, editor, intent())).rejects.toMatchObject({ code: "upload_sessions" }); await cancelMediaUpload(db, editor, first.id); expect(await createMediaUpload(db, editor, intent())).toBeTruthy();
});
it("one worker owns a live lease; expired leases recover with a new token", async () => {
 const row = await queued(); const first = await claimMediaUpload(db); expect(first?.id).toBe(row.id); expect(await claimMediaUpload(db)).toBeNull(); await db.update(schema.mediaUploadSessions).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(schema.mediaUploadSessions.id, row.id)); const recovered = await claimMediaUpload(db); expect(recovered?.leaseToken).not.toBe(first?.leaseToken); expect(recovered?.attempts).toBe(2);
});
it("cancelled queued media never invokes processors or publishes", async () => {
 const row = await queued(); await cancelMediaUpload(db, editor, row.id); expect(await processOneMediaUpload(db)).toBe(false); expect(mocks.audio).not.toHaveBeenCalled(); expect(await db.select().from(schema.podcasts)).toHaveLength(0);
});
it("processing permission revocation prevents commit and removes only generated media", async () => {
 const row = await queued(); mocks.audio.mockImplementationOnce(async () => { await engine.exec("update staff_users set role='reader' where id='fixture-editor'"); return { buffer: Buffer.from("aac"), extension: "m4a", durationSec: 60, originalBytes: 14 }; });
 await processOneMediaUpload(db); expect((await mediaUploadStatus(db, editor, row.id)).state).toBe("failed"); expect(await db.select().from(schema.podcasts)).toHaveLength(0); expect(mocks.remove).toHaveBeenCalledTimes(2);
});
it("expired session is cleaned and cannot retain quota indefinitely", async () => {
 const row = await queued(); await db.update(schema.mediaUploadSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.mediaUploadSessions.id, row.id)); await cleanExpiredUploads(db); await expect(ownMediaUpload(db, editor, row.id)).rejects.toMatchObject({ status: 404 });
});
it("source checksum corruption fails before durable media writes", async () => {
 const row = await queued(); const { writeFile } = await import("node:fs/promises"); await writeFile(resolve(uploadDirectory(row.id), "audio-0.part"), Buffer.alloc(audio.length)); await processOneMediaUpload(db); expect((await mediaUploadStatus(db, editor, row.id)).state).toBe("failed"); expect(mocks.write).not.toHaveBeenCalled();
});
it("published video URL uses a single UUID accepted by editorial validation", async () => {
 const video = Buffer.from("fixture video"); const row = await createMediaUpload(db, editor, uploadIntent.parse({ kind: "video", files: [{ key: "video", name: "fixture.mp4", bytes: video.length, type: "video/mp4", sha256: checksum(video) }], metadata: {} })); await putMediaChunk(db, editor, row.id, "video", 0, checksum(video), video); await completeMediaUpload(db, editor, row.id); await processOneMediaUpload(db); const state = await mediaUploadStatus(db, editor, row.id); expect(state.result?.url).toMatch(/^\/media\/news\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.mp4$/);
 const { videoSourceUrl } = await import("@newspoint/content"); expect(videoSourceUrl(String(state.result?.url))).toBe(state.result?.url);
});



it("cancellation retains the heavy slot until the current processor stops, including repeated cancel", async () => {
 const row = await queued(); await queued(); let during = false;
 mocks.audio.mockImplementationOnce(async () => {
  await cancelMediaUpload(db, editor, row.id); await cancelMediaUpload(db, editor, row.id);
  expect(await claimMediaUpload(db)).toBeNull(); await cleanExpiredUploads(db); expect(await readFile(resolve(uploadDirectory(row.id), "audio-0.part"))).toEqual(audio); during = true;
  return { buffer: Buffer.from("aac"), extension: "m4a", durationSec: 60, originalBytes: audio.length };
 });
 await processOneMediaUpload(db); expect(during).toBe(true); expect((await mediaUploadStatus(db, editor, row.id)).state).toBe("cancelled"); expect(await db.select().from(schema.podcasts)).toHaveLength(0); expect(await claimMediaUpload(db)).not.toBeNull();
});
it("lost commit acknowledgement keeps referenced media and allows later source cleanup", async () => {
 const row = await queued(); const original = db.transaction.bind(db); let count = 0;
 const spy = vi.spyOn(db, "transaction").mockImplementation((async callback => { const value = await original(callback); if (++count === 2) throw new Error("simulated acknowledgement lost after COMMIT"); return value; }) as typeof db.transaction);
 await processOneMediaUpload(db); spy.mockRestore();
 expect((await mediaUploadStatus(db, editor, row.id)).state).toBe("ready"); expect(mocks.remove).not.toHaveBeenCalled(); expect(await db.select().from(schema.podcasts)).toHaveLength(1); await cleanExpiredUploads(db); expect(mocks.remove).not.toHaveBeenCalled();
});
it("deleted owner cannot run a queued job and private files are removed without orphan directories", async () => {
 const row = await queued(); await engine.exec("delete from staff_users where id='fixture-editor'"); expect(await claimMediaUpload(db)).toBeNull(); await cleanExpiredUploads(db); expect(await db.select().from(schema.mediaUploadSessions)).toHaveLength(0); await expect(readFile(resolve(uploadDirectory(row.id), "audio-0.part"))).rejects.toMatchObject({ code: "ENOENT" });
});
it("global quota reserves processing peak and includes expired uncleaned source files", async () => {
 const video = uploadIntent.parse({ kind: "video", files: [{ key: "video", name: "large.mp4", bytes: 200 * 1024 ** 2, type: "video/mp4", sha256: "0".repeat(64) }], metadata: {} });
 const first = await createMediaUpload(db, editor, video); await createMediaUpload(db, editor, video);
 expect(first.reservedBytes).toBe(900 * 1024 ** 2); await db.update(schema.mediaUploadSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.mediaUploadSessions.id, first.id));
 await expect(createMediaUpload(db, "other", video)).rejects.toMatchObject({ code: "upload_quota" }); await cleanExpiredUploads(db); expect(await createMediaUpload(db, "other", video)).toBeTruthy();
});
it("accepts exact file limits and rejects over-limit, zero and incomplete manifests", () => {
 const input = intent(); expect(uploadIntent.safeParse({ ...input, files: input.files.map(f => f.key === "audio" ? { ...f, bytes: 100 * 1024 ** 2 } : f) }).success).toBe(true);
 expect(uploadIntent.safeParse({ ...input, files: input.files.map(f => f.key === "audio" ? { ...f, bytes: 100 * 1024 ** 2 + 1 } : f) }).success).toBe(false);
 expect(uploadIntent.safeParse({ ...input, files: [input.files[0]] }).success).toBe(false);
 expect(uploadIntent.safeParse({ ...input, files: input.files.map(f => ({ ...f, bytes: 0 })) }).success).toBe(false);
});

it("a paused stale worker cannot overwrite or delete a newer committed attempt", async () => {
 const row = await queued();
 let entered!: () => void, release!: () => void;
 const writing = new Promise<void>(resolve => { entered = resolve; });
 const paused = new Promise<void>(resolve => { release = resolve; });
 let staleKey = "";
 mocks.write.mockImplementationOnce(async (key: string) => { staleKey = key; entered(); await paused; });
 const oldWorker = processOneMediaUpload(db);
 await writing;
 let committedKeys: string[] = [];
 try {
  await db.update(schema.mediaUploadSessions).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(schema.mediaUploadSessions.id, row.id));
  expect(await processOneMediaUpload(db)).toBe(true);
  const ready = await mediaUploadStatus(db, editor, row.id);
  expect(ready.state).toBe("ready");
  const episode = (ready.result as any).episode;
  committedKeys = [episode.coverKey, episode.audioKey];
  expect(committedKeys).not.toContain(staleKey);
 } finally { release(); await oldWorker; }
 const ready = await mediaUploadStatus(db, editor, row.id);
 expect(ready.state).toBe("ready");
 expect(await db.select().from(schema.podcasts)).toHaveLength(1);
 for (const key of committedKeys) expect(mocks.remove).not.toHaveBeenCalledWith(key);
 // Later cleanup can remove the abandoned artifact, while keeping the actual publication.
 await db.update(schema.mediaUploadSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.mediaUploadSessions.id, row.id));
 await cleanExpiredUploads(db);
 expect(mocks.remove).toHaveBeenCalledWith(staleKey);
 for (const key of committedKeys) expect(mocks.remove).not.toHaveBeenCalledWith(key);
});

it("rejects a wrong whole-file manifest checksum even when every part has the correct digest", async () => {
 const input = intent();
 input.files = input.files.map(file => file.key === "audio" ? { ...file, sha256: "0".repeat(64) } : file);
 const row = await createMediaUpload(db, editor, input);
 for (const file of input.files) {
  const bytes = file.key === "audio" ? audio : cover;
  await putMediaChunk(db, editor, row.id, file.key, 0, checksum(bytes), bytes);
 }
 await completeMediaUpload(db, editor, row.id);
 await processOneMediaUpload(db);
 expect((await mediaUploadStatus(db, editor, row.id)).state).toBe("failed");
 expect(mocks.audio).not.toHaveBeenCalled();
 expect(mocks.write).not.toHaveBeenCalled();
 expect(await db.select().from(schema.podcasts)).toHaveLength(0);
});


it("migration permits uploaded hero create/save/revision/publish while rejecting non-contract local paths", async () => {
 const url = "/media/news/2026/10/360a3346-fae0-43c2-991a-dc73728ca9c9.mp4";
 const created = await engine.query<{ id: string }>("insert into articles(hero_embed_url) values($1) returning id", [url]); const articleId = created.rows[0]!.id;
 await engine.query("insert into article_revisions(article_id,hero_embed_url) values($1,$2)", [articleId,url]); await engine.query("update articles set hero_embed_url=$1,is_public=true where id=$2", [url,articleId]);
 expect((await engine.query<{ is_public: boolean }>("select is_public from articles where id=$1",[articleId])).rows[0]!.is_public).toBe(true);
 for (const invalid of ["http://example.com/video.mp4", "/media/news/2026/13/360a3346-fae0-43c2-991a-dc73728ca9c9.mp4", "/media/news/2026/10/not-a-uuid.mp4", "/media/news/2026/10/../secret.mp4", url+"?x=1", url.replace(".mp4",".webm")]) {
  await expect(engine.query("insert into articles(hero_embed_url) values($1)",[invalid])).rejects.toMatchObject({ code: "23514" });
  await expect(engine.query("insert into article_revisions(hero_embed_url) values($1)",[invalid])).rejects.toMatchObject({ code: "23514" });
 }
});
