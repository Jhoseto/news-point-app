import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { ScriptDb } from "@newspoint/db/node";
import { hasInstagramPublishing, type InstagramJob } from "@newspoint/db/instagram-publishing";
import { InstagramClient, InstagramError, instagramConfiguration } from "@newspoint/content/instagram";
import { socialArticleUrl } from "@newspoint/content";
import { mediaFile, readMediaFile, writeMediaFile } from "@newspoint/content/upload-media";
import { renderInstagramPostImage } from "./facebook-post-image";
const LEASE_MS = 180000;
const DELAYS = [60000, 300000, 900000, 3600000];
export async function claimInstagramJob(db: ScriptDb): Promise<InstagramJob | null> {
    return db.transaction(async (tx) => {
        await tx.execute(sql `update instagram_publications set status='uncertain',error_code='lost_response',lease_token=null,lease_until=null,updated_at=now()
      where status='sending' and lease_until<now()`);
        await tx.execute(sql `update instagram_publications set status='pending',lease_token=null,lease_until=null where status='working' and lease_until<now()`);
        const [row] = await tx.execute<InstagramJob>(sql `select * from instagram_publications where status in ('pending','retry') and next_attempt_at<=now()
      and (lease_until is null or lease_until<now()) order by next_attempt_at limit 1 for update skip locked`);
        if (!row)
            return null;
        const [claimed] = await tx.execute<InstagramJob>(sql `update instagram_publications set status='working',lease_token=${randomUUID()}::uuid,
      lease_until=now()+(${LEASE_MS} * interval '1 millisecond'),updated_at=now() where id=${row.id}::uuid returning *`);
        return claimed ?? null;
    });
}
export async function prepareInstagramPhoto(job: InstagramJob): Promise<{
    imageKey: string;
    imageHash: string;
}> {
    if (!job.storage_key?.startsWith("news/") || !/^[a-f0-9-]{36}$/.test(job.id))
        throw new InstagramError("image");
    if (!process.env.MEDIA_SSH_TARGET) {
        const path = mediaFile(job.storage_key);
        const info = path ? await stat(path).catch(() => null) : null;
        if (!info?.isFile() || info.size > 32 * 1024 * 1024)
            throw new InstagramError("image");
    }
    const source = await readMediaFile(job.storage_key);
    if (!source || source.length > 32 * 1024 * 1024)
        throw new InstagramError("image");
    let bytes: Buffer;
    try {
        bytes = await renderInstagramPostImage(source, job.title);
    }
    catch {
        throw new InstagramError("image");
    }
    if (bytes.length > 4 * 1024 * 1024)
        throw new InstagramError("image");
    const imageHash = createHash("sha256").update(bytes).digest("hex");
    const imageKey = `news/social-instagram/${job.id}-${imageHash}.jpg`;
    // Only published editorial intent reaches this step. The original is never overwritten.
    await writeMediaFile(imageKey, bytes);
    return { imageKey, imageHash };
}
export async function processInstagramJob(db: ScriptDb, job: InstagramJob, dependencies: {
    client?: Pick<InstagramClient, "publish">;
    prepare?: typeof prepareInstagramPhoto;
} = {}) {
    const owned = sql `id=${job.id}::uuid and lease_token=${job.lease_token}::uuid and lease_until>now()`;
    const finish = async (status: string, error: string | null = null, delay = 0) => db.execute(sql `update instagram_publications set status=${status},error_code=${error},
    next_attempt_at=now()+(${delay} * interval '1 millisecond'),lease_token=null,lease_until=null,updated_at=now() where ${owned}`);
    let sending = false;
    try {
        if (process.env.INSTAGRAM_PUBLISHING_ENABLED !== "1") {
            await finish("pending", null, 60000);
            return;
        }
        const [article] = await db.execute<{
            is_public: boolean;
            published_at: Date | null;
        }>(sql `select is_public,published_at from articles where id=${job.article_id}::uuid`);
        if (!article?.is_public || !article.published_at || new Date(article.published_at) > new Date()) {
            await finish("cancelled");
            return;
        }
        const config = instagramConfiguration();
        if (!config || config.accountId !== job.account_id)
            throw new InstagramError("connection");
        const url = new URL(job.article_url);
        if (socialArticleUrl(process.env.WEB_URL, url.pathname) !== job.article_url)
            throw new InstagramError("origin");
        let imageKey = job.image_key, imageHash = job.image_hash;
        if (!imageKey) {
            const image = await (dependencies.prepare ?? prepareInstagramPhoto)(job);
            imageKey = image.imageKey;
            imageHash = image.imageHash;
        }
        if (!imageHash || !/^[a-f0-9]{64}$/.test(imageHash) || imageKey !== `news/social-instagram/${job.id}-${imageHash}.jpg`)
            throw new InstagramError("image");
        if (process.env.INSTAGRAM_PUBLISHING_ENABLED !== "1") {
            await finish("pending", null, 60000);
            return;
        }
        const started = await db.execute(sql `update instagram_publications set image_key=${imageKey},image_hash=${imageHash},status='sending',
      attempts=attempts+1,operation_started_at=now(),updated_at=now(),lease_until=now()+(${LEASE_MS} * interval '1 millisecond') where ${owned}
      and exists(select 1 from articles where id=${job.article_id}::uuid and is_public and published_at<=now()) returning id`);
        if (!started.length)
            return;
        sending = true;
        const result = await (dependencies.client ?? new InstagramClient(config)).publish({ jobId: job.id, accountId: job.account_id, caption: job.caption, imageUrl: `${url.origin}/media/${imageKey}` });
        // Lease token fencing: a late sender cannot acknowledge a replacement job.
        await db.execute(sql `update instagram_publications set status='succeeded',post_id=${result.postId},permalink=${result.permalink},error_code=null,
      lease_token=null,lease_until=null,updated_at=now() where ${owned}`);
    }
    catch (error) {
        const e = error instanceof InstagramError ? error : new InstagramError(sending ? "lost_response" : "internal", !sending, sending);
        const attempts = job.attempts + 1;
        const retry = !e.uncertain && e.retryable && attempts <= DELAYS.length && Date.now() - new Date(job.created_at).getTime() < 86400000;
        // Local preparation failures must also be bounded, even without an external attempt.
        if (!sending)
            await db.execute(sql `update instagram_publications set attempts=attempts+1 where ${owned}`);
        await finish(e.uncertain ? "uncertain" : retry ? "retry" : "failed", e.code, Math.max(e.retryAfter, DELAYS[Math.min(attempts - 1, DELAYS.length - 1)] ?? 3600000));
    }
}
export function startInstagramPublishingWorker(db: ScriptDb, log: (message: string) => void) {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running: Promise<void> = Promise.resolve();
    let warned = 0;
    async function tick() {
        try {
            if (process.env.INSTAGRAM_PUBLISHING_ENABLED === "1" && await hasInstagramPublishing(db)) {
                const job = await claimInstagramJob(db);
                if (job)
                    await processInstagramJob(db, job);
            }
        }
        catch {
            if (Date.now() - warned > 60000) {
                log("Instagram: processing paused; check configuration/database.");
                warned = Date.now();
            }
        }
        finally {
            if (!stopped)
                timer = setTimeout(() => { running = tick(); }, 3000);
        }
    }
    running = tick();
    return async () => { stopped = true; clearTimeout(timer); await running; };
}
