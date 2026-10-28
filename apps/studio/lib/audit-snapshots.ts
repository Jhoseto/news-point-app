import "server-only";
import { readRevisionSocial } from "@newspoint/db/social-publishing";
import { getDb, articles, articleRevisions, articleViewBoosts, pageArrangements, storyThemes, storyThemeArticles, polls, podcasts, aiPodcastProjects, aiPodcastJobs, aiPodcastAssets, aiPodcastVoiceSettings, staffUsers, authorProfiles, livepointSubmissions, mediaAssets, mediaPresentations } from "@newspoint/db";
import { and, asc, desc, eq, inArray } from "@newspoint/db/orm";
import type { AuditArea, AuditDetails, AuditValue } from "./audit-types";
import type { AuditInput } from "./audit-metadata";

const uuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
function pick(row: unknown, fields: string[]): AuditValue {
  if (!row || typeof row !== "object") return null;
  const object = row as Record<string, unknown>;
  return JSON.parse(JSON.stringify(Object.fromEntries(fields.map(key => [key, object[key] ?? null])))) as AuditValue;
}

export async function auditSnapshot(area: AuditArea, id: string, input: AuditInput): Promise<AuditValue> {
  const db = getDb();
  if (area === "articles" && uuid(id)) {
    const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
    const number = typeof input.auditRevision === "number" ? input.auditRevision : typeof input.expectedRevision === "number" ? input.expectedRevision : null;
    const [revision] = await db.select().from(articleRevisions).where(and(eq(articleRevisions.articleId, id), number !== null ? eq(articleRevisions.number, number) : undefined)).orderBy(desc(articleRevisions.number)).limit(1);
    const [views] = await db.select().from(articleViewBoosts).where(eq(articleViewBoosts.articleId, id)).limit(1);
    return { article: pick(article, ["id", "title", "slug", "path", "isPublic", "publishedRevision", "publishedAt", "scheduledPublishAt", "listenEnabled"]),
      revision: pick(revision ?? article, ["id", "number", "title", "slug", "excerpt", "body", "primaryCategoryId", "heroMediaId", "heroEmbedUrl", "authorKind", "authorUserId", "authorName", "listenEnabled"]),
      social: JSON.parse(JSON.stringify(await readRevisionSocial(db, id, revision?.number ?? 0, revision?.title ?? article?.title ?? ""))) as AuditValue,
      views: pick(views, ["seedCount", "targetCount", "intervalSeconds"]) };
  }
  if (area === "arrangements" && id) {
    const rows = await db.select().from(pageArrangements).where(and(eq(pageArrangements.pageKey, id), inArray(pageArrangements.status, ["draft", "published"]))).orderBy(asc(pageArrangements.status));
    return Object.fromEntries(rows.map(row => [row.status, pick(row, ["id", "document", "note", "publishedAt"])]));
  }
  if (area === "stories" && input.action === "assignArticle" && uuid(String(input.articleId))) {
    return await db.select({ themeId: storyThemeArticles.themeId, articleId: storyThemeArticles.articleId, position: storyThemeArticles.position }).from(storyThemeArticles).where(eq(storyThemeArticles.articleId, String(input.articleId)));
  }
  if (area === "stories" && uuid(id)) {
    const [row] = await db.select().from(storyThemes).where(eq(storyThemes.id, id)).limit(1);
    const members = await db.select({ articleId: storyThemeArticles.articleId, position: storyThemeArticles.position }).from(storyThemeArticles).where(eq(storyThemeArticles.themeId, id)).orderBy(asc(storyThemeArticles.position));
    return row ? { theme: pick(row, ["id", "title", "slug", "summary", "intro", "coverMediaId", "coverCaption", "isPublished", "publishedAt"]), articles: members } : null;
  }
  if (area === "stories" && input.action === "assignArticle" && uuid(String(input.articleId))) {
    return await db.select({ themeId: storyThemeArticles.themeId, articleId: storyThemeArticles.articleId, position: storyThemeArticles.position }).from(storyThemeArticles).where(eq(storyThemeArticles.articleId, String(input.articleId)));
  }
  if (area === "polls" && uuid(id)) {
    const [row] = await db.select().from(polls).where(eq(polls.id, id)).limit(1);
    return pick(row, ["id", "question", "description", "options", "status", "featured", "startsAt", "endsAt", "adjustments", "version"]);
  }
  if (area === "podcasts") {
    if (input.action === "setVoices") return pick((await db.select().from(aiPodcastVoiceSettings).limit(1))[0], ["alexVoice", "mayaVoice"]);
    if (!uuid(id)) return null;
    if (input.jobId) return pick((await db.select().from(aiPodcastJobs).where(eq(aiPodcastJobs.id, id)).limit(1))[0], ["id", "projectId", "kind", "status", "attempts"]);
    if (input.assetId) return pick((await db.select().from(aiPodcastAssets).where(eq(aiPodcastAssets.id, id)).limit(1))[0], ["id", "kind", "preset", "status", "storageKey"]);
    if (input.auditAi || input.projectId) return pick((await db.select().from(aiPodcastProjects).where(eq(aiPodcastProjects.id, id)).limit(1))[0], ["id", "title", "summary", "settings", "segments", "status", "revision", "coverKey", "musicAssetId", "episodeId"]);
    return pick((await db.select().from(podcasts).where(eq(podcasts.id, id)).limit(1))[0], ["id", "title", "slug", "summary", "categoryId", "status", "coverKey", "audioKey", "durationSec", "bytes", "publishedAt"]);
  }
  if ((area === "users" || area === "profile") && id) {
    const [user] = await db.select({ id: staffUsers.id, name: staffUsers.name, email: staffUsers.email, role: staffUsers.role, image: staffUsers.image }).from(staffUsers).where(eq(staffUsers.id, id)).limit(1);
    const [profile] = await db.select().from(authorProfiles).where(eq(authorProfiles.staffUserId, id)).limit(1);
    return user ? { user, profile: pick(profile, ["bio", "avatarMediaId", "isPublic"]) } : null;
  }
  if (area === "submissions" && uuid(id)) return pick((await db.select().from(livepointSubmissions).where(eq(livepointSubmissions.id, id)).limit(1))[0], ["id", "kind", "status", "articleId"]);
  if (area === "media" && uuid(id)) {
    const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
    const [presentation] = await db.select().from(mediaPresentations).where(eq(mediaPresentations.mediaAssetId, id)).limit(1);
    return asset ? { asset: pick(asset, ["id", "storageKey", "mime", "width", "height", "alt", "caption", "credit"]), presentation: pick(presentation, ["variants"]) } : null;
  }
  return null;
}

/** Preserve the titles at the moment of the action, even if those stories are later renamed. */
export async function auditArticleLabels(details: AuditDetails): Promise<AuditDetails> {
  const ids = [...new Set(JSON.stringify(details).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [])].slice(0, 500);
  if (!ids.length) return {};
  const rows = await getDb().select({ id: articles.id, title: articles.title }).from(articles).where(inArray(articles.id, ids));
  return rows.length ? { articleTitles: Object.fromEntries(rows.map(row => [row.id, row.title])) } : {};
}

export function snapshotLabel(value: AuditValue): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  for (const key of ["title", "question", "name"]) if (typeof value[key] === "string") return value[key];
  for (const key of ["revision", "article", "theme", "user"]) { const label = snapshotLabel(value[key] ?? null); if (label) return label; }
  return "";
}
