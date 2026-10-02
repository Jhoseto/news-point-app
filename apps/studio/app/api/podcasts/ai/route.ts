import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { aiPodcastSegment, aiPodcastSettings, articleText, type AiPodcastSegment, type AiPodcastSource } from "@newspoint/content";
import { aiPodcastAssets, aiPodcastAudit, aiPodcastJobs, aiPodcastProjects, aiPodcastVoiceSettings, articles, getDb, podcasts } from "@newspoint/db";
import { studioOrigins } from "@/lib/auth";
import { staffFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const id = z.uuid();
const action = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), settings: aiPodcastSettings }),
  z.strictObject({ action: z.literal("edit"), projectId: id, revision: z.number().int().positive(), segments: z.array(aiPodcastSegment).min(1).max(7), title: z.string().trim().min(2).max(180), summary: z.string().trim().min(1).max(600) }),
  z.strictObject({ action: z.literal("rewrite"), projectId: id, segmentId: id, direction: z.string().trim().min(2).max(1000) }),
  z.strictObject({ action: z.literal("produce"), projectId: id }),
  z.strictObject({ action: z.literal("regenerateSegment"), projectId: id, segmentId: id }),
  z.strictObject({ action: z.literal("regenerateCover"), projectId: id }),
  z.strictObject({ action: z.literal("cancel"), jobId: id }),
  z.strictObject({ action: z.literal("retry"), jobId: id }),
  z.strictObject({ action: z.literal("music"), preset: z.enum(["daily", "evening", "breaking"]).nullable(), projectId: id.nullable(), prompt: z.string().trim().min(10).max(1000) }),
  z.strictObject({ action: z.literal("approveMusic"), assetId: id }),
  z.strictObject({ action: z.literal("setVoices"), alex: z.string().trim().min(2).max(100), maya: z.string().trim().min(2).max(100) }),
]);

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "private, no-store" } });
}

async function ready() {
  try {
    const rows = await getDb().execute<{ ready: boolean }>(sql`select to_regclass('public.ai_podcast_projects') is not null as ready`);
    return rows[0]?.ready === true;
  } catch { return false; }
}

async function audit(projectId: string, actorId: string, name: string, details: unknown = {}) {
  await getDb().insert(aiPodcastAudit).values({ projectId, actorId, action: name, details });
}

async function project(idValue: string) {
  const [row] = await getDb().select().from(aiPodcastProjects).where(eq(aiPodcastProjects.id, idValue)).limit(1);
  return row ?? null;
}

async function activeJob(projectId: string) {
  const [row] = await getDb().select({ id: aiPodcastJobs.id }).from(aiPodcastJobs)
    .where(and(eq(aiPodcastJobs.projectId, projectId), inArray(aiPodcastJobs.status, ["queued", "running"]))).limit(1);
  return Boolean(row);
}

export async function GET(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff) return json({ error: "Влезте отново." }, 401);
  if (!await ready()) return json({ ready: false, error: "Приложете миграция 23_ai_podcast_studio.sql." }, 503);
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "projects";
  if (view === "articles") {
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const rows = await getDb().select({ id: articles.id, title: articles.title, path: articles.path, publishedAt: articles.publishedAt })
      .from(articles).where(and(eq(articles.isPublic, true), sql`${articles.publishedAt} is not null`, q ? or(ilike(articles.title, `%${q}%`), ilike(articles.excerpt, `%${q}%`)) : undefined))
      .orderBy(desc(articles.publishedAt)).limit(30);
    return json({ articles: rows });
  }
  if (view === "project") {
    const parsed = id.safeParse(url.searchParams.get("id"));
    if (!parsed.success) return json({ error: "Невалиден проект." }, 400);
    const row = await project(parsed.data);
    if (!row) return json({ error: "Проектът не е намерен." }, 404);
    const jobs = await getDb().select().from(aiPodcastJobs).where(eq(aiPodcastJobs.projectId, row.id)).orderBy(desc(aiPodcastJobs.createdAt)).limit(20);
    const [episode] = row.episodeId ? await getDb().select({ id: podcasts.id, audioKey: podcasts.audioKey, coverKey: podcasts.coverKey, durationSec: podcasts.durationSec, status: podcasts.status, slug: podcasts.slug }).from(podcasts).where(eq(podcasts.id, row.episodeId)).limit(1) : [];
    return json({ project: row, jobs, episode: episode ?? null });
  }
  if (view === "assets") {
    const assets = await getDb().select().from(aiPodcastAssets).orderBy(desc(aiPodcastAssets.createdAt)).limit(100);
    const [voices] = await getDb().select().from(aiPodcastVoiceSettings).limit(1);
    const jobs = await getDb().select().from(aiPodcastJobs).where(eq(aiPodcastJobs.kind, "music")).orderBy(desc(aiPodcastJobs.createdAt)).limit(20);
    return json({ assets, voices: voices ?? null, jobs });
  }
  const rows = await getDb().select({ id: aiPodcastProjects.id, title: aiPodcastProjects.title, status: aiPodcastProjects.status, revision: aiPodcastProjects.revision, episodeId: aiPodcastProjects.episodeId, createdAt: aiPodcastProjects.createdAt })
    .from(aiPodcastProjects).orderBy(desc(aiPodcastProjects.createdAt)).limit(100);
  return json({ projects: rows });
}

export async function POST(request: Request) {
  if (!studioOrigins().trusted.includes(request.headers.get("origin") ?? "")) return json({ error: "Заявката трябва да идва от Studio." }, 403);
  const staff = await staffFromRequest(request);
  if (!staff || !["editor", "admin", "master_admin"].includes(staff.role)) return json({ error: "Нямате достъп." }, 403);
  if (!await ready()) return json({ error: "Приложете миграция 23_ai_podcast_studio.sql." }, 503);
  const parsed = action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Невалидни данни.", issues: parsed.error.issues }, 400);
  const input = parsed.data;
  try {
    if (input.action === "create") {
      const found = await getDb().select({ id: articles.id, title: articles.title, path: articles.path, excerpt: articles.excerpt, body: articles.body, version: articles.version, publishedRevision: articles.publishedRevision, publishedAt: articles.publishedAt })
        .from(articles).where(and(inArray(articles.id, input.settings.articleIds), eq(articles.isPublic, true), sql`${articles.publishedAt} is not null`));
      if (found.length !== input.settings.articleIds.length) return json({ error: "Изберете 3–5 публикувани статии." }, 400);
      const byId = new Map(found.map((row) => [row.id, row]));
      const sources: AiPodcastSource[] = input.settings.articleIds.map((articleId) => {
        const row = byId.get(articleId)!;
        return { id: row.id, title: row.title, path: row.path, excerpt: row.excerpt, text: articleText(row.body), version: row.version, publishedRevision: row.publishedRevision, publishedAt: row.publishedAt!.toISOString() };
      });
      if (sources.some((source) => source.text.length < 80)) return json({ error: "Някоя от статиите няма достатъчно публикуван текст." }, 400);
      const result = await getDb().transaction(async (tx) => {
        const [row] = await tx.insert(aiPodcastProjects).values({ settings: input.settings, sources, createdBy: staff.id, status: "scripting" }).returning({ id: aiPodcastProjects.id });
        await tx.insert(aiPodcastJobs).values({ projectId: row!.id, kind: "script", requestedBy: staff.id });
        await tx.insert(aiPodcastAudit).values({ projectId: row!.id, actorId: staff.id, action: "created", details: { articleIds: input.settings.articleIds } });
        return row!;
      });
      return json({ id: result.id }, 201);
    }
    if (input.action === "setVoices") {
      if (staff.role === "editor") return json({ error: "Само администратор одобрява гласовете." }, 403);
      if (input.alex === input.maya) return json({ error: "Изберете два различни гласа." }, 400);
      await getDb().insert(aiPodcastVoiceSettings).values({ id: true, alexVoice: input.alex, mayaVoice: input.maya, approvedBy: staff.id })
        .onConflictDoUpdate({ target: aiPodcastVoiceSettings.id, set: { alexVoice: input.alex, mayaVoice: input.maya, approvedBy: staff.id, updatedAt: new Date() } });
      return json({ ok: true });
    }
    if (input.action === "music") {
      if (input.preset && staff.role === "editor") return json({ error: "Само администратор управлява музикалната библиотека." }, 403);
      if (!input.preset && !input.projectId) return json({ error: "Липсва проект за новата музика." }, 400);
      if (input.projectId && !await project(input.projectId)) return json({ error: "Проектът не е намерен." }, 404);
      const [job] = await getDb().insert(aiPodcastJobs).values({ projectId: input.projectId, kind: "music", payload: { preset: input.preset, prompt: input.prompt }, requestedBy: staff.id }).returning({ id: aiPodcastJobs.id });
      return json({ jobId: job!.id }, 201);
    }
    if (input.action === "approveMusic") {
      if (staff.role === "editor") return json({ error: "Само администратор одобрява музиката." }, 403);
      const [asset] = await getDb().select().from(aiPodcastAssets).where(eq(aiPodcastAssets.id, input.assetId)).limit(1);
      if (!asset || asset.kind !== "music" || !asset.preset) return json({ error: "Невалидна музика." }, 404);
      await getDb().transaction(async (tx) => {
        await tx.update(aiPodcastAssets).set({ status: "candidate" }).where(and(eq(aiPodcastAssets.kind, "music"), eq(aiPodcastAssets.preset, asset.preset!)));
        await tx.update(aiPodcastAssets).set({ status: "approved" }).where(eq(aiPodcastAssets.id, asset.id));
      });
      return json({ ok: true });
    }
    if (input.action === "cancel" || input.action === "retry") {
      const [job] = await getDb().select().from(aiPodcastJobs).where(eq(aiPodcastJobs.id, input.jobId)).limit(1);
      if (!job) return json({ error: "Задачата не е намерена." }, 404);
      if (input.action === "cancel") {
        if (!["queued", "running"].includes(job.status)) return json({ error: "Задачата вече е завършена." }, 409);
        await getDb().update(aiPodcastJobs).set({ status: "cancelled", updatedAt: new Date() }).where(eq(aiPodcastJobs.id, job.id));
        if (job.projectId) await getDb().update(aiPodcastProjects).set({ status: "review", updatedAt: new Date() }).where(eq(aiPodcastProjects.id, job.projectId));
      } else {
        if (job.status !== "failed" || job.attempts >= 5) return json({ error: "Задачата не може да се повтори." }, 409);
        await getDb().update(aiPodcastJobs).set({ status: "queued", error: null, leaseUntil: null, updatedAt: new Date() }).where(eq(aiPodcastJobs.id, job.id));
        if (job.projectId) await getDb().update(aiPodcastProjects).set({ status: job.kind === "script" || job.kind === "check" ? "scripting" : "producing", updatedAt: new Date() }).where(eq(aiPodcastProjects.id, job.projectId));
      }
      if (job.projectId) await audit(job.projectId, staff.id, input.action, { jobId: job.id });
      return json({ ok: true });
    }
    const row = await project(input.projectId);
    if (!row) return json({ error: "Проектът не е намерен." }, 404);
    if (await activeJob(row.id)) return json({ error: "За проекта вече има активна задача." }, 409);
    if (input.action === "edit") {
      if (row.status !== "review" || row.revision !== input.revision) return json({ error: "Сценарият е променен. Презаредете проекта." }, 409);
      const sources = row.sources as AiPodcastSource[];
      if (input.segments.some((segment) => segment.sourceId && !sources.some((source) => source.id === segment.sourceId))) return json({ error: "Невалиден източник на сюжет." }, 400);
      const old = row.segments as AiPodcastSegment[];
      const segments = input.segments.map((segment) => {
        const previous = old.find((item) => item.id === segment.id);
        const same = previous && JSON.stringify({ label: previous.label, lines: previous.lines, sourceId: previous.sourceId }) === JSON.stringify({ label: segment.label, lines: segment.lines, sourceId: segment.sourceId });
        return { ...segment, wavKey: same ? previous.wavKey : null, version: same ? previous.version : (previous?.version ?? 0) + 1 };
      });
      await getDb().transaction(async (tx) => {
        await tx.update(aiPodcastProjects).set({ title: input.title, summary: input.summary, segments, warnings: [], status: "scripting", revision: row.revision + 1, updatedAt: new Date() }).where(eq(aiPodcastProjects.id, row.id));
        await tx.insert(aiPodcastJobs).values({ projectId: row.id, kind: "check", requestedBy: staff.id });
      });
      await audit(row.id, staff.id, "edited", { revision: row.revision + 1 });
      return json({ ok: true, revision: row.revision + 1 });
    }
    if (input.action === "rewrite") {
      if (row.status !== "review" || !(row.segments as AiPodcastSegment[]).some((segment) => segment.id === input.segmentId)) return json({ error: "Сюжетът не е готов за редакция." }, 409);
      const [job] = await getDb().insert(aiPodcastJobs).values({ projectId: row.id, kind: "script", payload: { segmentId: input.segmentId, direction: input.direction }, requestedBy: staff.id }).returning({ id: aiPodcastJobs.id });
      return json({ jobId: job!.id });
    }
    if (input.action === "produce" || input.action === "regenerateSegment" || input.action === "regenerateCover") {
      if (!["review", "ready"].includes(row.status)) return json({ error: "Първо прегледайте сценария." }, 409);
      if (input.action !== "regenerateCover") {
        const [voices] = await getDb().select().from(aiPodcastVoiceSettings).limit(1);
        if (!voices) return json({ error: "Администратор трябва да одобри гласовете на Алекс и Мая." }, 409);
      }
      if (row.episodeId) {
        const [episode] = await getDb().select({ status: podcasts.status }).from(podcasts).where(eq(podcasts.id, row.episodeId)).limit(1);
        if (episode?.status === "published") return json({ error: "Първо скрийте публикувания епизод, преди да променяте аудиото или обложката." }, 409);
      }
      if (input.action === "regenerateSegment" && !(row.segments as AiPodcastSegment[]).some((segment) => segment.id === input.segmentId)) return json({ error: "Сюжетът не е намерен." }, 404);
      const kind = input.action === "produce" ? "produce" : input.action === "regenerateCover" ? "cover" : "segment";
      const payload = input.action === "regenerateSegment" ? { segmentId: input.segmentId } : {};
      const [job] = await getDb().insert(aiPodcastJobs).values({ projectId: row.id, kind, payload, requestedBy: staff.id }).returning({ id: aiPodcastJobs.id });
      await getDb().update(aiPodcastProjects).set({ status: "producing", updatedAt: new Date() }).where(eq(aiPodcastProjects.id, row.id));
      await audit(row.id, staff.id, input.action, { jobId: job!.id });
      return json({ jobId: job!.id });
    }
    return json({ error: "Непознато действие." }, 400);
  } catch (error) {
    console.error("[ai-podcast-api]", error instanceof Error ? error.message : error);
    return json({ error: "Действието не успя. Проверете настройките и опитайте отново." }, 503);
  }
}
