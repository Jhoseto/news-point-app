import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { aiPodcastSegment, aiPodcastSettings, aiPodcastSource, aiPodcastWarning, podcastSlug, targetWords, type AiPodcastSegment, type AiPodcastWarning } from "@newspoint/content";
import { aiPodcastAssets, aiPodcastAudit, aiPodcastJobs, aiPodcastProjects, aiPodcastVoiceSettings, podcasts, type ScriptDb } from "@newspoint/db/node";
import { assertAudioTools, brandedCover, aiStorageKey, loadMedia, masterAudio, publicPodcastKey, saveMedia } from "./ai-media";
import { automaticIntro, checkIntro, checkStory, directPerformance, episodeMetadata, factPack, generateImage, generateMusic, storyScript, synthesize } from "./ai-gemini";

type Job = typeof aiPodcastJobs.$inferSelect;
type Project = typeof aiPodcastProjects.$inferSelect;

async function claim(db: ScriptDb): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(aiPodcastJobs)
      .where(or(eq(aiPodcastJobs.status, "queued"), and(eq(aiPodcastJobs.status, "running"), lt(aiPodcastJobs.leaseUntil, new Date()))))
      .orderBy(asc(aiPodcastJobs.createdAt)).limit(1).for("update", { skipLocked: true });
    if (!row) return null;
    if (row.attempts >= 5) {
      await tx.update(aiPodcastJobs).set({ status: "failed", error: "Maximum attempts reached", updatedAt: new Date() }).where(eq(aiPodcastJobs.id, row.id));
      return null;
    }
    const [claimed] = await tx.update(aiPodcastJobs).set({ status: "running", attempts: row.attempts + 1, leaseUntil: new Date(Date.now() + 15 * 60_000), error: null, updatedAt: new Date() }).where(eq(aiPodcastJobs.id, row.id)).returning();
    return claimed ?? null;
  });
}

async function requireRunning(db: ScriptDb, jobId: string) {
  const [row] = await db.select({ status: aiPodcastJobs.status }).from(aiPodcastJobs).where(eq(aiPodcastJobs.id, jobId)).limit(1);
  if (row?.status !== "running") throw new Error("Job cancelled");
  await db.update(aiPodcastJobs).set({ leaseUntil: new Date(Date.now() + 15 * 60_000), updatedAt: new Date() }).where(eq(aiPodcastJobs.id, jobId));
}

async function progress(db: ScriptDb, jobId: string, stage: string, completed = 0, total = 0) {
  await db.update(aiPodcastJobs).set({ usage: { progress: { stage, completed, total } }, updatedAt: new Date() })
    .where(and(eq(aiPodcastJobs.id, jobId), eq(aiPodcastJobs.status, "running")));
}

async function getProject(db: ScriptDb, id: string): Promise<Project> {
  const [row] = await db.select().from(aiPodcastProjects).where(eq(aiPodcastProjects.id, id)).limit(1);
  if (!row) throw new Error("Project missing");
  return row;
}

async function history(db: ScriptDb, projectId: string, action: string, details: unknown = {}) {
  await db.insert(aiPodcastAudit).values({ projectId, action, details });
}

async function script(db: ScriptDb, job: Job, project: Project): Promise<unknown> {
  const settings = aiPodcastSettings.parse(project.settings);
  const sources = aiPodcastSource.array().parse(project.sources);
  const payload = job.payload as { segmentId?: string; direction?: string };
  const old = aiPodcastSegment.array().parse(project.segments);
  if (payload.segmentId) {
    const previous = old.find((segment) => segment.id === payload.segmentId);
    if (!previous?.sourceId) throw new Error("Story segment missing");
    const source = sources.find((item) => item.id === previous.sourceId)!;
    await progress(db, job.id, "Извличане на факти за избрания сюжет");
    const facts = await factPack(source);
    await requireRunning(db, job.id);
    const previousWords = previous.lines.reduce((sum, line) => sum + line.text.trim().split(/\s+/).length, 0);
    await progress(db, job.id, "Пренаписване на сюжета");
    const written = await storyScript(source, facts.value, previousWords, settings.style, settings.direction, payload.direction);
    await requireRunning(db, job.id);
    const changed: AiPodcastSegment = { ...previous, label: written.value.label, lines: written.value.lines, wavKey: null, version: previous.version + 1 };
    await progress(db, job.id, "Проверка на фактите в сюжета");
    const checked = await checkStory(source, changed.id, changed.lines, changed.label);
    const warnings = aiPodcastWarning.array().parse(project.warnings).filter((warning) => warning.segmentId !== changed.id).concat(checked.value);
    await db.update(aiPodcastProjects).set({ segments: old.map((item) => item.id === changed.id ? changed : item), warnings, revision: project.revision + 1, status: "review", updatedAt: new Date() }).where(eq(aiPodcastProjects.id, project.id));
    await history(db, project.id, "rewritten", { segmentId: changed.id, version: changed.version, previous, next: changed });
    return { facts: facts.usage, script: written.usage, check: checked.usage };
  }
  const segments: AiPodcastSegment[] = [];
  const warnings: AiPodcastWarning[] = [];
  const packs = [];
  const packMap: Record<string, unknown> = {};
  const usage: unknown[] = [];
  if (settings.introMode === "exact") {
    segments.push({ id: randomUUID(), sourceId: null, label: "Увод", lines: [{ speaker: "alex", text: settings.intro, direction: "" }], wavKey: null, version: 1 });
  } else {
    await progress(db, job.id, "Подготовка на увода");
    const intro = await automaticIntro(sources.map((source) => source.title), settings.style);
    segments.push({ id: randomUUID(), sourceId: null, label: "Увод", lines: intro.value.lines, wavKey: null, version: 1 });
    usage.push(intro.usage);
  }
  const introWords = segments[0]!.lines.reduce((sum, line) => sum + line.text.trim().split(/\s+/).length, 0);
  await progress(db, job.id, "Проверка на увода");
  const introCheck = await checkIntro(sources, segments[0]!.id, segments[0]!.lines);
  warnings.push(...introCheck.value);
  usage.push(introCheck.usage);
  const wordsPerStory = Math.max(80, Math.round((targetWords(settings) - introWords) / sources.length));
  for (const [index, source] of sources.entries()) {
    await requireRunning(db, job.id);
    await progress(db, job.id, `Факти: ${source.title}`, index, sources.length);
    const facts = await factPack(source);
    packs.push(facts.value);
    packMap[source.id] = facts.value;
    await progress(db, job.id, `Сценарий: ${source.title}`, index, sources.length);
    const written = await storyScript(source, facts.value, wordsPerStory, settings.style, settings.direction);
    const segment: AiPodcastSegment = { id: randomUUID(), sourceId: source.id, label: written.value.label, lines: written.value.lines, wavKey: null, version: 1 };
    await progress(db, job.id, `Проверка: ${source.title}`, index, sources.length);
    const checked = await checkStory(source, segment.id, segment.lines, segment.label);
    segments.push(segment);
    warnings.push(...checked.value);
    usage.push({ facts: facts.usage, script: written.usage, check: checked.usage });
  }
  await requireRunning(db, job.id);
  await progress(db, job.id, "Заглавие и резюме", sources.length, sources.length);
  const metadata = await episodeMetadata(sources.map((source) => source.title), packs);
  await requireRunning(db, job.id);
  await db.update(aiPodcastProjects).set({ title: metadata.value.title, summary: metadata.value.summary, factPacks: packMap, segments, warnings, status: "review", revision: project.revision + 1, updatedAt: new Date() }).where(eq(aiPodcastProjects.id, project.id));
  await history(db, project.id, "script_ready", { warnings: warnings.length, sources: sources.length });
  return { calls: usage, metadata: metadata.usage };
}

async function checkEdited(db: ScriptDb, job: Job, project: Project): Promise<unknown> {
  const sources = aiPodcastSource.array().parse(project.sources);
  const segments = aiPodcastSegment.array().parse(project.segments);
  const changedIds = (job.payload as { segmentIds?: string[] }).segmentIds;
  const warnings: AiPodcastWarning[] = aiPodcastWarning.array().parse(project.warnings).filter((warning) => changedIds && !changedIds.includes(warning.segmentId));
  const usage = [];
  for (const segment of segments) {
    if (changedIds && !changedIds.includes(segment.id)) continue;
    await requireRunning(db, job.id);
    await progress(db, job.id, `Проверка: ${segment.label}`, usage.length, changedIds?.length ?? segments.length);
    if (!segment.sourceId) {
      const result = await checkIntro(sources, segment.id, segment.lines);
      warnings.push(...result.value);
      usage.push(result.usage);
      continue;
    }
    const source = sources.find((item) => item.id === segment.sourceId);
    if (!source) throw new Error("Source snapshot missing");
    const result = await checkStory(source, segment.id, segment.lines, segment.label);
    warnings.push(...result.value);
    usage.push(result.usage);
  }
  await requireRunning(db, job.id);
  await db.update(aiPodcastProjects).set({ warnings, status: "review", updatedAt: new Date() }).where(eq(aiPodcastProjects.id, project.id));
  return { calls: usage };
}

async function cover(db: ScriptDb, job: Job, project: Project): Promise<unknown> {
  const sources = aiPodcastSource.array().parse(project.sources);
  await progress(db, job.id, "Генериране на фон за обложката");
  const result = await generateImage(sources.map((source) => source.title));
  await requireRunning(db, job.id);
  await progress(db, job.id, "Поставяне на лого и заглавие");
  const bytes = await brandedCover(result.bytes, project.title || "NewsPoint Podcast");
  const key = publicPodcastKey("webp");
  await saveMedia(key, bytes);
  await requireRunning(db, job.id);
  await db.update(aiPodcastProjects).set({ coverKey: key, status: project.episodeId ? "ready" : "review", updatedAt: new Date() }).where(eq(aiPodcastProjects.id, project.id));
  if (project.episodeId) await db.update(podcasts).set({ coverKey: key, updatedAt: new Date() }).where(and(eq(podcasts.id, project.episodeId), eq(podcasts.status, "draft")));
  return result.usage;
}

async function music(db: ScriptDb, job: Job): Promise<unknown> {
  const payload = job.payload as { preset: "daily" | "evening" | "breaking" | null; prompt: string };
  await progress(db, job.id, "Генериране на инструментална музика");
  const result = await generateMusic(payload.prompt);
  await requireRunning(db, job.id);
  const key = aiStorageKey("mp3");
  await saveMedia(key, result.bytes);
  await requireRunning(db, job.id);
  const [asset] = await db.insert(aiPodcastAssets).values({ kind: "music", preset: payload.preset, storageKey: key, prompt: payload.prompt, model: "lyria-3.5", metadata: { synthId: true, usage: result.usage }, createdBy: job.requestedBy }).returning({ id: aiPodcastAssets.id });
  if (job.projectId && asset) {
    const project = await getProject(db, job.projectId);
    const settings = aiPodcastSettings.parse(project.settings);
    await db.update(aiPodcastProjects).set({ musicAssetId: asset.id, settings: { ...settings, music: "custom" }, updatedAt: new Date() }).where(eq(aiPodcastProjects.id, job.projectId));
  }
  return result.usage;
}

async function produce(db: ScriptDb, job: Job, project: Project): Promise<unknown> {
  await progress(db, job.id, "Проверка на аудио инструментите");
  await assertAudioTools();
  const settings = aiPodcastSettings.parse(project.settings);
  const sources = aiPodcastSource.array().parse(project.sources);
  const [voices] = await db.select().from(aiPodcastVoiceSettings).limit(1);
  if (!voices) throw new Error("Brand voices are not approved");
  let segments = aiPodcastSegment.array().parse(project.segments);
  if (!segments.length) throw new Error("Script is empty");
  const { segmentId: onlySegmentId, remixOnly } = job.payload as { segmentId?: string; remixOnly?: boolean };
  if (remixOnly && (!project.episodeId || !project.coverKey || segments.some((segment) => !segment.wavKey))) throw new Error("Saved voice and cover assets are required for music remix");
  const usage: unknown[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (onlySegmentId && segment.id !== onlySegmentId) continue;
    if (segment.wavKey && !onlySegmentId) continue;
    await requireRunning(db, job.id);
    await progress(db, job.id, `Озвучаване: ${segment.label}`, i, segments.length);
    const directed = segment.lines.every((line) => line.spoken) ? { lines: segment.lines, usage: {} } : await directPerformance(segment.lines);
    const result = await synthesize(directed.lines, { alex: voices.alexVoice, maya: voices.mayaVoice });
    const key = aiStorageKey("wav", project.id);
    await saveMedia(key, result.bytes);
    await requireRunning(db, job.id);
    segments = segments.map((item) => item.id === segment.id ? { ...item, lines: directed.lines, wavKey: key } : item);
    await db.update(aiPodcastProjects).set({ segments, updatedAt: new Date() }).where(eq(aiPodcastProjects.id, project.id));
    usage.push({ director: directed.usage, tts: result.usage });
  }
  await requireRunning(db, job.id);
  await progress(db, job.id, "Зареждане на аудио сегментите", segments.length, segments.length);
  const waveBytes = await Promise.all(segments.map((segment) => segment.wavKey ? loadMedia(segment.wavKey) : Promise.reject(new Error("Voice segment missing"))));
  let musicBytes: Buffer | null = null;
  let musicAssetId: string | null = null;
  if (settings.music !== "none") {
    const [asset] = settings.music === "custom"
      ? await db.select().from(aiPodcastAssets).where(eq(aiPodcastAssets.id, project.musicAssetId ?? "00000000-0000-0000-0000-000000000000")).limit(1)
      : await db.select().from(aiPodcastAssets).where(and(eq(aiPodcastAssets.kind, "music"), eq(aiPodcastAssets.status, "approved"), eq(aiPodcastAssets.preset, settings.music))).limit(1);
    if (!asset) throw new Error(`Music ${settings.music} is not ready`);
    musicBytes = await loadMedia(asset.storageKey);
    musicAssetId = asset.id;
  }
  let coverKey = project.coverKey;
  if (!coverKey) {
    await progress(db, job.id, "Генериране на обложката", segments.length, segments.length);
    const result = await generateImage(sources.map((source) => source.title));
    const bytes = await brandedCover(result.bytes, project.title || "NewsPoint Podcast");
    coverKey = publicPodcastKey("webp");
    await saveMedia(coverKey, bytes);
    await requireRunning(db, job.id);
    await db.update(aiPodcastProjects).set({ coverKey, updatedAt: new Date() }).where(eq(aiPodcastProjects.id, project.id));
    usage.push(result.usage);
  }
  await requireRunning(db, job.id);
  await progress(db, job.id, "Смесване и мастериране на MP3", segments.length, segments.length);
  const targetSeconds = settings.minutes * 60;
  const mastered = await masterAudio(waveBytes, musicBytes, targetSeconds);
  const durationWarning = mastered.durationSec < targetSeconds * .9 || mastered.durationSec > targetSeconds * 1.1;
  const audioKey = publicPodcastKey("mp3");
  await progress(db, job.id, "Записване на аудио черновата", segments.length, segments.length);
  await saveMedia(audioKey, mastered.bytes);
  await requireRunning(db, job.id);
  if (project.episodeId) {
    const [updated] = await db.update(podcasts).set({ title: project.title!, summary: project.summary!, coverKey, audioKey, durationSec: mastered.durationSec, bytes: mastered.bytes.length, updatedAt: new Date() })
      .where(and(eq(podcasts.id, project.episodeId), eq(podcasts.status, "draft"))).returning({ id: podcasts.id });
    if (!updated) throw new Error("Published episode cannot be replaced; hide it first");
  } else {
    const [episode] = await db.insert(podcasts).values({ title: project.title!, slug: podcastSlug(project.title!, randomBytes(3).toString("hex")), summary: project.summary!, coverKey, audioKey, durationSec: mastered.durationSec, bytes: mastered.bytes.length, categoryId: settings.categoryId, status: "draft", createdBy: project.createdBy }).returning({ id: podcasts.id });
    await db.update(aiPodcastProjects).set({ episodeId: episode!.id }).where(eq(aiPodcastProjects.id, project.id));
  }
  await db.update(aiPodcastProjects).set({ status: "ready", musicAssetId, updatedAt: new Date() }).where(eq(aiPodcastProjects.id, project.id));
  await history(db, project.id, "audio_ready", { durationSec: mastered.durationSec, targetSeconds, tempo: mastered.tempo, durationWarning, audioKey });
  return { calls: usage, durationSec: mastered.durationSec, targetSeconds, tempo: mastered.tempo, durationWarning, voices: { alex: voices.alexVoice, maya: voices.mayaVoice }, musicAssetId };
}

export async function processOneAiPodcastJob(db: ScriptDb): Promise<boolean> {
  const tables = await db.execute<{ ready: boolean }>(sql`select to_regclass('public.ai_podcast_jobs') is not null as ready`);
  if (tables[0]?.ready !== true) return false;
  const job = await claim(db);
  if (!job) return false;
  try {
    const project = job.projectId ? await getProject(db, job.projectId) : null;
    const usage = job.kind === "music" ? await music(db, job)
      : !project ? Promise.reject(new Error("Project missing"))
        : job.kind === "script" ? await script(db, job, project)
          : job.kind === "check" ? await checkEdited(db, job, project)
            : job.kind === "cover" ? await cover(db, job, project)
              : await produce(db, job, project);
    await db.update(aiPodcastJobs).set({ status: "succeeded", usage, leaseUntil: null, updatedAt: new Date() }).where(and(eq(aiPodcastJobs.id, job.id), eq(aiPodcastJobs.status, "running")));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown error";
    const [failed] = await db.update(aiPodcastJobs).set({ status: "failed", error: message, leaseUntil: null, updatedAt: new Date() })
      .where(and(eq(aiPodcastJobs.id, job.id), eq(aiPodcastJobs.status, "running"))).returning({ id: aiPodcastJobs.id });
    if (failed && job.projectId && job.kind !== "music") await db.update(aiPodcastProjects).set({ status: "failed", updatedAt: new Date() }).where(eq(aiPodcastProjects.id, job.projectId));
    console.error(`[ai-podcast] job ${job.id} failed: ${message}`);
  }
  return true;
}
