import { expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { aiPodcastSegment, articleText, prepareSegmentEdits, type AiPodcastSource } from "@newspoint/content";
import { aiPodcastAudit, aiPodcastJobs, aiPodcastProjects, articles, createScriptDb, loadRootEnv, podcasts, staffUsers } from "@newspoint/db/node";
import { processOneAiPodcastJob } from "./ai-podcast-worker";
import { loadMedia } from "./ai-media";

it.skipIf(process.env.AI_STUDIO_FULL_SMOKE !== "1")("creates a real five-minute MP3 draft from three published articles", async () => {
  loadRootEnv();
  const { db, close } = createScriptDb("dev");
  let projectId = process.env.AI_STUDIO_SMOKE_PROJECT_ID || "";
  async function project() {
    const [row] = await db.select().from(aiPodcastProjects).where(eq(aiPodcastProjects.id, projectId)).limit(1);
    if (!row) throw new Error(`Smoke project ${projectId} missing`);
    return row;
  }
  async function runJob(kind: "script" | "check" | "music" | "cover" | "produce", requestedBy: string, payload: Record<string, unknown> = {}) {
    const [job] = await db.insert(aiPodcastJobs).values({ projectId, kind, requestedBy, payload }).returning({ id: aiPodcastJobs.id });
    const deadline = Date.now() + 12 * 60_000;
    while (Date.now() < deadline) {
      const [current] = await db.select({ status: aiPodcastJobs.status, error: aiPodcastJobs.error }).from(aiPodcastJobs).where(eq(aiPodcastJobs.id, job!.id)).limit(1);
      if (current?.status === "succeeded") return;
      if (current?.status === "failed") throw new Error(`${kind} failed on project ${projectId}: ${current.error}`);
      if (current?.status === "queued") await processOneAiPodcastJob(db);
      else await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(`${kind} did not finish on project ${projectId}`);
  }
  try {
    const [staff] = await db.select({ id: staffUsers.id }).from(staffUsers).where(inArray(staffUsers.role, ["master_admin", "admin", "editor"])).limit(1);
    if (!staff) throw new Error("No editor account available for smoke draft");
    if (!projectId) {
      const rows = await db.select().from(articles).where(and(eq(articles.isPublic, true), sql`${articles.publishedAt} is not null`)).orderBy(desc(articles.publishedAt)).limit(30);
      const selected = rows.filter((row) => articleText(row.body).length >= 80).slice(0, 3);
      if (selected.length !== 3) throw new Error("Three published source articles are required");
      const sources: AiPodcastSource[] = selected.map((row) => ({ id: row.id, title: row.title, path: row.path, excerpt: row.excerpt, text: articleText(row.body), version: row.version, publishedRevision: row.publishedRevision, publishedAt: row.publishedAt!.toISOString() }));
      const [created] = await db.insert(aiPodcastProjects).values({ settings: { articleIds: sources.map((source) => source.id), minutes: 5, style: "natural", introMode: "automatic", intro: "", direction: "", music: "custom", categoryId: null }, sources, createdBy: staff.id, status: "scripting" }).returning({ id: aiPodcastProjects.id });
      projectId = created!.id;
      await db.insert(aiPodcastAudit).values({ projectId, actorId: staff.id, action: "manual_full_smoke", details: { sourceIds: sources.map((source) => source.id) } });
      console.log(`AI Studio smoke project: ${projectId}`);
    }
    let row = await project();
    if (!aiPodcastSegment.array().safeParse(row.segments).success || aiPodcastSegment.array().parse(row.segments).length === 0) {
      await runJob("script", staff.id);
      row = await project();
    }
    if (row.status === "failed" && aiPodcastSegment.array().parse(row.segments).length > 0) {
      await db.update(aiPodcastProjects).set({ status: "review", updatedAt: new Date() }).where(eq(aiPodcastProjects.id, projectId));
      row = await project();
    }
    expect(row.status).toBe("review");
    expect(aiPodcastSegment.array().parse(row.segments).length).toBeGreaterThanOrEqual(4);

    const original = aiPodcastSegment.array().parse(row.segments);
    const firstStory = original.find((segment) => segment.sourceId);
    if (!firstStory) throw new Error("Generated script has no story");
    if (firstStory.lines[0]?.direction !== "Спокойно и ясно.") {
      const edited = original.map((segment) => segment.id === firstStory.id ? { ...segment, lines: segment.lines.map((line, index) => index === 0 ? { ...line, direction: "Спокойно и ясно." } : line) } : segment);
      const prepared = prepareSegmentEdits(original, edited);
      await db.update(aiPodcastProjects).set({ segments: prepared.segments, warnings: [], revision: row.revision + 1, status: "scripting", updatedAt: new Date() }).where(eq(aiPodcastProjects.id, projectId));
      await runJob("check", staff.id, { segmentIds: prepared.changedIds });
      row = await project();
      expect(row.status).toBe("review");
    }

    if (!row.musicAssetId) {
      await runJob("music", staff.id, { preset: null, prompt: "Original instrumental electronic news podcast bed, gentle rhythmic pulse, warm synth texture, seamless loop, no voices or vocals." });
      row = await project();
    }
    expect(row.musicAssetId).not.toBeNull();
    if (!row.coverKey) {
      await runJob("cover", staff.id);
      row = await project();
    }
    expect(row.coverKey).toMatch(/\.webp$/);
    if (process.env.AI_STUDIO_SMOKE_THROUGH_COVER === "1") {
      await mkdir("tests/reports/ai-studio", { recursive: true });
      await writeFile("tests/reports/ai-studio/real-cover.webp", await loadMedia(row.coverKey!));
      return;
    }
    await db.update(aiPodcastProjects).set({ status: "producing", updatedAt: new Date() }).where(eq(aiPodcastProjects.id, projectId));
    await runJob("produce", staff.id);
    row = await project();
    expect(row.status).toBe("ready");
    expect(row.episodeId).not.toBeNull();
    const [episode] = await db.select().from(podcasts).where(eq(podcasts.id, row.episodeId!)).limit(1);
    expect(episode?.status).toBe("draft");
    expect(episode?.durationSec).toBeGreaterThanOrEqual(270);
    expect(episode?.durationSec).toBeLessThanOrEqual(330);
    expect(episode?.audioKey).toMatch(/\.mp3$/);
    expect(episode?.coverKey).toMatch(/\.webp$/);
  } finally { await close(); }
}, 20 * 60_000);
