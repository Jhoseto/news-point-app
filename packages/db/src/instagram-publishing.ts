import { sql } from "drizzle-orm";
import { instagramText, normalizeInstagram, socialArticleUrl, socialOrigin, type InstagramInput, type SocialStatus } from "@newspoint/content";
import { instagramConfiguration } from "@newspoint/content/instagram";
import type { ScriptDb } from "./node";
type Executor = Pick<ScriptDb, "execute">;
export type InstagramJob = {
    id: string;
    article_id: string | null;
    revision: number;
    account_id: string;
    title: string;
    caption: string;
    article_url: string;
    storage_key: string | null;
    status: string;
    image_key: string | null;
    image_hash: string | null;
    post_id: string | null;
    permalink: string | null;
    attempts: number;
    next_attempt_at: Date;
    lease_token: string | null;
    lease_until: Date | null;
    operation_started_at: Date | null;
    error_code: string | null;
    created_at: Date;
    updated_at: Date;
};
export async function hasInstagramPublishing(db: Executor) {
    const rows = await db.execute<{
        ready: boolean;
    }>(sql `select to_regclass('public.instagram_publications') is not null as ready`);
    return rows[0]?.ready === true;
}
export async function readInstagramRevision(db: Executor, id: string, revision: number, title: string): Promise<InstagramInput | undefined> {
    if (!await hasInstagramPublishing(db))
        return undefined;
    const [row] = await db.execute<{
        enabled: boolean;
        text: string;
        text_mode: "auto" | "custom";
    }>(sql `
    select enabled,text,text_mode from article_revision_social where article_id=${id}::uuid and revision=${revision} and provider='instagram'`);
    return row ? normalizeInstagram({ enabled: row.enabled, text: row.text, textMode: row.text_mode }, title) : undefined;
}
export async function writeInstagramRevision(db: Executor, id: string, revision: number, title: string, value: InstagramInput | undefined, previousRevision: number) {
    if (!await hasInstagramPublishing(db)) {
        if (value?.enabled || value?.textMode === "custom")
            throw new Error("Instagram изисква миграция 43.");
        return;
    }
    // Older open editor tabs omit Instagram; preserve the previous saved intent.
    const previous = value ?? (previousRevision ? await readInstagramRevision(db, id, previousRevision, title) : undefined);
    if (!previous)
        return;
    const input = normalizeInstagram(previous, title);
    await db.execute(sql `insert into article_revision_social(article_id,revision,provider,enabled,text,text_mode)
    values(${id}::uuid,${revision},'instagram',${input.enabled},${input.text},${input.textMode})`);
}
/** Called within the existing public manual/scheduled publication transaction, after QA exclusion. */
export async function enqueueInstagramPublication(db: Executor, id: string, revision: number) {
    if (!await hasInstagramPublishing(db))
        return;
    const config = instagramConfiguration();
    const origin = socialOrigin(process.env.WEB_URL);
    const [source] = await db.execute<{ title: string; body: unknown; text: string; text_mode: "auto" | "custom" }>(sql`
      select r.title,r.body,s.text,s.text_mode from article_revisions r join article_revision_social s
      on s.article_id=r.article_id and s.revision=r.number and s.provider='instagram' and s.enabled
      where r.article_id=${id}::uuid and r.number=${revision}`);
    if (!source) return;
    const caption = source.text_mode === "auto" ? instagramText(source.title, source.body) : source.text;
    await db.execute(sql `insert into instagram_publications(article_id,revision,account_id,title,caption,article_url,storage_key,status,error_code)
    select a.id,r.number,${config?.accountId ?? "unconnected"},r.title,${caption},${origin ?? ""}||a.path,m.storage_key,
      case when ${Boolean(config && origin)} and m.storage_key like 'news/%' and r.hero_embed_url is null and length(trim(${caption}))>0 then 'pending' else 'failed' end,
      case when not ${Boolean(origin)} then 'origin' when not ${Boolean(config)} then 'connection' when m.storage_key is null or m.storage_key not like 'news/%' or r.hero_embed_url is not null then 'image' when length(trim(${caption}))=0 then 'text' else null end
    from articles a join article_revisions r on r.article_id=a.id and r.number=${revision}
    join article_revision_social s on s.article_id=a.id and s.revision=r.number and s.provider='instagram' and s.enabled
    left join media_assets m on m.id=r.hero_media_id
    where a.id=${id}::uuid and a.is_public and a.published_at<=clock_timestamp() and a.published_revision=r.number
    on conflict(article_id) do nothing`);
}
export function instagramMessage(job: InstagramJob): string {
    if (job.status === "succeeded")
        return "Публикувано в Instagram.";
    if (job.status === "cancelled")
        return "Спряно — новината вече не е публична.";
    if (job.status === "uncertain")
        return "Непотвърден резултат. Администраторът трябва да провери Instagram и Make, преди нов опит.";
    if (job.error_code === "connection")
        return "Очаква свързване на Instagram от администратора.";
    if (job.error_code === "image")
        return "Необходима е основна снимка. Обновете новината и опитайте отново.";
    if (job.error_code === "text")
        return "Проверете текста за Instagram и опитайте отново.";
    if (job.error_code === "origin")
        return "Администраторът трябва да провери публичния адрес.";
    if (job.status === "failed")
        return "Изпращането не успя. Новината е публикувана в сайта.";
    if (job.status === "retry")
        return "Изчаква повторен опит.";
    return "Изчаква публикуване в Instagram.";
}
export async function readInstagramStatus(db: Executor, id?: string): Promise<SocialStatus> {
    const ready = await hasInstagramPublishing(db);
    const configured = instagramConfiguration();
    if (!ready)
        return { ready: false, connected: false, enabled: false, job: null };
    const [job] = id ? await db.execute<InstagramJob>(sql `select * from instagram_publications where article_id=${id}::uuid`) : [];
    return { ready, connected: Boolean(configured), enabled: process.env.INSTAGRAM_PUBLISHING_ENABLED === "1", job: job ? {
            id: job.id, status: job.status, step: job.image_key ? "photo" : "prepare", text: job.caption, url: job.permalink,
            message: instagramMessage(job), canRetry: job.status === "failed" && Boolean(configured) && !job.post_id,
        } : null };
}
export async function retryInstagramPublication(db: ScriptDb, id: string) {
    const config = instagramConfiguration();
    if (!config || !await hasInstagramPublishing(db))
        return false;
    return db.transaction(async (tx) => {
        const [article] = await tx.execute<{
            is_public: boolean;
            published_revision: number;
            path: string;
        }>(sql `select is_public,published_revision,path from articles where id=${id}::uuid for update`);
        if (!article?.is_public)
            return false;
        const [job] = await tx.execute<InstagramJob>(sql `select * from instagram_publications where article_id=${id}::uuid for update`);
        if (!job || job.status !== "failed" || job.post_id || !["unconnected", config.accountId].includes(job.account_id))
            return false;
        const [rev] = await tx.execute<{
            title: string;
            body: unknown;
            storage_key: string | null;
            hero_embed_url: string | null;
        }>(sql `
      select r.title,r.body,m.storage_key,r.hero_embed_url from article_revisions r left join media_assets m on m.id=r.hero_media_id
      where r.article_id=${id}::uuid and r.number=${article.published_revision}`);
        if (!rev?.storage_key?.startsWith("news/") || rev.hero_embed_url)
            return false;
        const input = await readInstagramRevision(tx, id, article.published_revision, rev.title);
        if (input?.textMode === "auto") input.text = instagramText(rev.title, rev.body);
        const url = socialArticleUrl(process.env.WEB_URL, article.path);
        if (!input?.enabled || !input.text.trim() || !url)
            return false;
        await tx.execute(sql `update instagram_publications set revision=${article.published_revision},account_id=${config.accountId},title=${rev.title},caption=${input.text},
      article_url=${url},storage_key=${rev.storage_key},image_key=null,image_hash=null,status='pending',attempts=0,error_code=null,
      operation_started_at=null,lease_token=null,lease_until=null,next_attempt_at=now(),updated_at=now() where id=${job.id}::uuid`);
        return true;
    });
}
