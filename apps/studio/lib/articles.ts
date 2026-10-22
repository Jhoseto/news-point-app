import "server-only";
import { enqueueSocialPublication, readRevisionSocial, writeRevisionSocial } from "@newspoint/db/social-publishing";
import { normalizeSocial, type SocialInput } from "@newspoint/content";
import { auditActive, auditEvidence } from "./audit-context";
import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, inArray, ne, sql } from "@newspoint/db/orm";
import {
  PUBLIC_MENU,
  articleBody,
  menuName,
  removeArticleFromArrangement,
  resolveMediaUrl,
  sofiaWallToUtc,
  triggerRevalidate,
  utcToSofiaWall,
  RESERVED_ARTICLE_SLUGS,
  type ArticleBody,
} from "@newspoint/content";
import {
  articleCategories,
  articleReadCounts,
  articleRevisions,
  articleViewBoosts,
  articles,
  categories,
  getDb,
  hasArticleReadCounts,
  hasArticleViewBoosts,
  applyArticlePublishViews,
  hasRevisionHomeHero, revisionHomeHero, writeRevisionHomeHero, publishHomeHero, lockArrangements, readArrangementDocument,
  hasRevisionListen,
  revisionListen,
  writeRevisionListen,
  qaPublicationAllowed,
  mediaAssets,
  outboxEvents,
  editorQaArticles,
  hasPageArrangements,
  pageArrangements,
  publishDueScheduled,
  publishRequests,
  staffUsers,
  type ArticleAuthorKind,
} from "@newspoint/db";
import { bodyToText, textToBody } from "./editor/body";
import type { DraftInput } from "./editor/input";
import { publishProblems } from "./editor/input";
import { articlePath } from "./editor/slug";
import { libraryImageUrl } from "./media-library";
import type { Staff } from "./session";
import { intervalToSeconds, splitInterval, type ViewUnit } from "./view-boost";
import { resolveFirstPublishedAt, ScheduledPublishConflictError } from "./publish-at";

export class EditorError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 422,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

// Paths the public site uses for its own routes.
const RESERVED_SLUGS = RESERVED_ARTICLE_SLUGS;

const draftPath = (id: string) => `/draft/${id}/`;

function publicAuditState(row: typeof articles.$inferSelect) {
  const { title, slug, path, excerpt, body, primaryCategoryId, heroMediaId, heroEmbedUrl, authorKind, authorUserId, authorName, isPublic, listenEnabled, publishedRevision, publishedAt, scheduledPublishAt } = row;
  return { title, slug, path, excerpt, body, primaryCategoryId, heroMediaId, heroEmbedUrl, authorKind, authorUserId, authorName, isPublic, listenEnabled, publishedRevision, publishedAt, scheduledPublishAt };
}

export interface Draft {
  social?: SocialInput;
  title: string;
  slug: string;
  excerpt: string;
  bodyText: string;
  body?: ArticleBody;
  listenEnabled?: boolean;
  primaryCategoryId: string | null;
  heroMediaId: string | null;
  heroEmbedUrl: string | null;
  authorKind: ArticleAuthorKind;
  authorUserId: string | null;
  authorName: string;
  viewSeed: number | null;
  viewEvery: number | null;
  viewUnit: ViewUnit;
  viewTarget: number | null;
  publishAtSofia: string | null;
  homeHeroPosition?: 1 | 2 | 3 | 4 | null;
}

export interface EditorArticle {
  id: string;
  sourceSystem: "wordpress" | "studio";
  isPublic: boolean;
  path: string;
  authorName: string;
  publishedAt: Date | null;
  publishedRevision: number | null;
  listenEnabled: boolean;
  revision: number;
  revisionSavedAt: Date | null;
  revisionSavedBy: string | null;
  draft: Draft;
  /** False for imported bodies the text editor cannot represent. */
  editableBody: boolean;
  canEdit: boolean;
  viewSeedLocked: boolean;
  viewReal: number;
  viewAdded: number;
}

export interface ArticleListItem {
  id: string;
  title: string;
  sourceSystem: "wordpress" | "studio";
  isPublic: boolean;
  path: string;
  publishedAt: Date | null;
  scheduledPublishAt?: Date | null;
  updatedAt: Date;
  categoryName: string | null;
  authorName: string | null;
  hasUnpublishedChanges: boolean;
  readCount: number | null;
  addedCount: number | null;
}

/** Same public rubrics as the reader menu — including „Гласът на истината“ and „На Фокус“. */
export async function homeHeroReady(): Promise<boolean> {
  return await hasRevisionHomeHero(getDb()) && await hasPageArrangements(getDb());
}

export async function listSections() {
  const slugs = PUBLIC_MENU.map((entry) => entry.slug);
  const rows = await getDb()
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .where(inArray(categories.slug, slugs));
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return PUBLIC_MENU.flatMap((entry) => {
    const row = bySlug.get(entry.slug);
    return row ? [{ id: row.id, slug: row.slug, name: menuName(row.slug, row.name) }] : [];
  });
}

export interface MediaOption {
  id: string;
  url: string;
  alt: string;
  caption?: string;
  credit?: string;
  width?: number | null;
  height?: number | null;
}

/** Only existing MediaAssets can be chosen (DEC-104); uploads come later. */
export async function listRecentMedia(limit = 48, include: string | string[] | null = null): Promise<MediaOption[]> {
  const db = getDb();
  const rows = await db.select().from(mediaAssets).where(sql`${mediaAssets.mime} is null or ${mediaAssets.mime} not like 'video/%'`).orderBy(desc(mediaAssets.createdAt)).limit(limit);
  const includeIds = [...new Set((Array.isArray(include) ? include : include ? [include] : []).filter(Boolean))];
  for (const id of includeIds) {
    if (rows.some((row) => row.id === id)) continue;
    rows.unshift(...(await db.select().from(mediaAssets).where(eq(mediaAssets.id, id))));
  }
  return rows.map((row) => ({
    id: row.id,
    url: row.storageKey ? libraryImageUrl(row.storageKey, row.sourceUrl) : resolveMediaUrl({ provider: row.provider, sourceUrl: row.sourceUrl, storageKey: row.storageKey }),
    alt: row.alt,
    caption: row.caption, credit: row.credit, width: row.width, height: row.height,
  }));
}


function toDraft(row: {
  title: string;
  slug: string;
  excerpt: string;
  body: unknown;
  primaryCategoryId: string | null;
  heroMediaId: string | null;
  heroEmbedUrl?: string | null;
  authorKind: ArticleAuthorKind;
  authorUserId: string | null;
  authorName: string;
}): { draft: Draft; editableBody: boolean } {
  const parsed = articleBody.safeParse(row.body);
  const text = parsed.success ? bodyToText(parsed.data) : null;
  const authorKind = row.authorKind === "staff" && !row.authorUserId ? "manual" : row.authorKind;
  return {
    draft: {
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      bodyText: text ?? "",
      ...(parsed.success ? { body: parsed.data } : {}),
      primaryCategoryId: row.primaryCategoryId,
      heroMediaId: row.heroMediaId,
      heroEmbedUrl: row.heroEmbedUrl ?? null,
      authorKind,
      authorUserId: authorKind === "staff" ? row.authorUserId : null,
      authorName: row.authorName,
      viewSeed: null,
      viewEvery: null,
      viewUnit: "seconds",
      viewTarget: null,
      publishAtSofia: null,
    },
    editableBody: parsed.success,
  };
}

export async function getEditorArticle(id: string): Promise<EditorArticle | null> {
  const db = getDb();
  const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!article) return null;
  const [latest] = await db
    .select({ revision: articleRevisions, savedBy: staffUsers.name })
    .from(articleRevisions)
    .leftJoin(staffUsers, eq(staffUsers.id, articleRevisions.createdBy))
    .where(eq(articleRevisions.articleId, id))
    .orderBy(desc(articleRevisions.number))
    .limit(1);

  const source = latest?.revision ?? { ...article, slug: article.isPublic ? article.slug : "" };
  const { draft, editableBody } = toDraft(source);
  draft.homeHeroPosition = latest && latest.revision.number > (article.publishedRevision ?? 0) ? await revisionHomeHero(db, id, latest.revision.number) : null;
  draft.listenEnabled = latest ? (await revisionListen(db, id, latest.revision.number)) ?? article.listenEnabled : article.listenEnabled;
  draft.social = await readRevisionSocial(db, id, latest?.revision.number ?? 0, draft.title);
  const boostsReady = await hasArticleViewBoosts(db);
  const [boost] = boostsReady
    ? await db.select().from(articleViewBoosts).where(eq(articleViewBoosts.articleId, id)).limit(1)
    : [];
  const readsReady = await hasArticleReadCounts(db);
  const [read] = readsReady
    ? await db.select({ readCount: articleReadCounts.readCount }).from(articleReadCounts).where(eq(articleReadCounts.articleId, id)).limit(1)
    : [];
  const interval = splitInterval(boost?.intervalSeconds ?? null);
  return {
    id: article.id,
    sourceSystem: article.sourceSystem,
    isPublic: article.isPublic,
    path: article.path,
    authorName: article.authorName,
    publishedAt: article.publishedAt,
    publishedRevision: article.publishedRevision,
    listenEnabled: article.listenEnabled,
    revision: latest?.revision.number ?? 0,
    revisionSavedAt: latest?.revision.createdAt ?? null,
    revisionSavedBy: latest?.savedBy ?? null,
    draft: {
      ...draft,
      viewSeed: boost && boost.seedCount > 0 ? boost.seedCount : null,
      viewEvery: interval.amount,
      viewUnit: interval.unit,
      viewTarget: boost?.targetCount ?? null,
      publishAtSofia: article.scheduledPublishAt ? utcToSofiaWall(article.scheduledPublishAt) : null,
    },
    editableBody,
    canEdit: true,
    viewSeedLocked: Boolean(boost?.seededAt),
    viewReal: read?.readCount ?? 0,
    viewAdded: boost?.artificialCount ?? 0,
  };
}

interface Authorship {
  authorKind: ArticleAuthorKind;
  authorUserId: string | null;
  authorName: string;
}

async function resolveAuthorship(db: Pick<ReturnType<typeof getDb>, "select">, draft: DraftInput): Promise<Authorship> {
  if (draft.authorKind === "newsroom") return { authorKind: "newsroom", authorUserId: null, authorName: "NewsPoint.bg" };
  if (draft.authorKind === "manual") return { authorKind: "manual", authorUserId: null, authorName: draft.authorName.trim() };
  const userId = draft.authorUserId?.trim();
  if (!userId) throw new EditorError(422, "invalid_author", "Изберете валиден авторски профил.");
  const [profile] = await db
    .select({ id: staffUsers.id, name: staffUsers.name })
    .from(staffUsers)
    .where(eq(staffUsers.id, userId))
    .limit(1);
  const name = profile?.name?.trim();
  if (!profile || !name) throw new EditorError(422, "invalid_author", "Изберете валиден авторски профил.");
  return { authorKind: "staff", authorUserId: profile.id, authorName: name };
}

function scheduleInstant(wall: string | null | undefined): Date | null {
  if (!wall) return null;
  const instant = sofiaWallToUtc(wall);
  if (!instant) throw new EditorError(422, "invalid_input", "Датата и часът не са валидни. Ползва се българско време.");
  return instant;
}

function revisionValues(draft: DraftInput, body: unknown, authorship: Authorship) {
  return {
    title: draft.title,
    slug: draft.slug,
    excerpt: draft.excerpt,
    body,
    primaryCategoryId: draft.primaryCategoryId,
    heroMediaId: draft.heroMediaId,
    heroEmbedUrl: draft.heroEmbedUrl,
    ...authorship,
  };
}

async function saveListening(tx: Pick<ReturnType<typeof getDb>, "execute">, id: string, number: number, enabled: boolean | undefined, current: boolean) {
  if (await hasRevisionListen(tx)) await writeRevisionListen(tx, id, number, enabled ?? current);
  else if (enabled !== undefined && enabled !== current) throw new EditorError(422, "migration_required", "Настройката за слушане изисква миграция 30. Другите промени не са записани.");
}

async function saveHomeHero(tx: Pick<ReturnType<typeof getDb>, "execute">, id: string, number: number, position: DraftInput["homeHeroPosition"]) {
  if (await hasRevisionHomeHero(tx)) await writeRevisionHomeHero(tx, id, number, position ?? null);
  else if (position != null) throw new EditorError(422, "migration_required", "Изборът на позиция изисква миграция 38. Промените не са записани.");
}

async function validateMedia(tx: Pick<ReturnType<typeof getDb>, "select">, draft: { heroMediaId: string | null }, body: ArticleBody) {
  const ids = [...new Set([draft.heroMediaId, ...body.flatMap(block => block.type === "image" ? [block.mediaAssetId] : [])].filter((id): id is string => !!id))];
  if (!ids.length) return;
  const found = await tx.select({ id: mediaAssets.id }).from(mediaAssets).where(inArray(mediaAssets.id, ids));
  if (found.length !== ids.length) throw new EditorError(422, "invalid_media", "Избрана снимка вече не съществува. Изберете я отново.");
}

async function viewDraft(tx: Pick<ReturnType<typeof getDb>, "select" | "execute">, articleId: string) {
  if (!await hasArticleViewBoosts(tx)) return {};
  const [boost] = await tx.select().from(articleViewBoosts).where(eq(articleViewBoosts.articleId, articleId)).limit(1);
  const interval = splitInterval(boost?.intervalSeconds ?? null);
  return {
    viewSeed: boost && boost.seedCount > 0 ? boost.seedCount : null,
    viewEvery: interval.amount,
    viewUnit: interval.unit,
    viewTarget: boost?.targetCount ?? null,
  };
}

async function saveViewSettings(tx: Pick<ReturnType<typeof getDb>, "insert" | "execute">, articleId: string, draft: DraftInput) {
  if (!await hasArticleViewBoosts(tx)) return;
  const intervalSeconds = intervalToSeconds(draft.viewEvery ?? null, draft.viewUnit ?? "minutes");
  await tx.insert(articleViewBoosts).values({
    articleId,
    seedCount: draft.viewSeed ?? 0,
    intervalSeconds,
    targetCount: draft.viewTarget ?? null,
  }).onConflictDoUpdate({
    target: articleViewBoosts.articleId,
    set: {
      seedCount: draft.viewSeed ?? 0,
      intervalSeconds,
      targetCount: draft.viewTarget ?? null,
      updatedAt: new Date(),
    },
  });
}

async function refreshViewSchedule(tx: Pick<ReturnType<typeof getDb>, "select" | "update" | "execute">, articleId: string) {
  if (!await hasArticleViewBoosts(tx)) return;
  const [boost] = await tx.select().from(articleViewBoosts).where(eq(articleViewBoosts.articleId, articleId)).limit(1);
  if (!boost?.seededAt) return;
  const [read] = await tx.select({ readCount: articleReadCounts.readCount }).from(articleReadCounts).where(eq(articleReadCounts.articleId, articleId)).limit(1);
  const displayed = (read?.readCount ?? 0) + boost.artificialCount;
  const auto = boost.intervalSeconds != null && boost.targetCount != null && displayed < boost.targetCount;
  if (!auto) {
    if (boost.nextIncrementAt) await tx.update(articleViewBoosts).set({ nextIncrementAt: null, updatedAt: new Date() }).where(eq(articleViewBoosts.articleId, articleId));
    return;
  }
  if (boost.nextIncrementAt) return;
  await tx.update(articleViewBoosts).set({
    nextIncrementAt: sql`now() + make_interval(secs => ${boost.intervalSeconds})`,
    updatedAt: new Date(),
  }).where(eq(articleViewBoosts.articleId, articleId));
}

export async function createArticle(staff: Staff, draft: DraftInput): Promise<{ id: string; revision: number }> {
  const body = draft.body ?? textToBody(draft.bodyText ?? "");
  return getDb().transaction(async (tx) => {
    const authorship = await resolveAuthorship(tx, draft);
    const id = draft.creationId ?? crypto.randomUUID();
    const inserted = await tx.insert(articles).values({
      id,
      sourceSystem: "studio",
      slug: id,
      path: draftPath(id),
      title: draft.title,
      excerpt: draft.excerpt,
      ...authorship,
      body,
      primaryCategoryId: draft.primaryCategoryId,
      heroMediaId: draft.heroMediaId,
      heroEmbedUrl: draft.heroEmbedUrl,
      isPublic: false,
      scheduledPublishAt: scheduleInstant(draft.publishAtSofia),
      createdBy: staff.id,
    }).onConflictDoNothing({ target: articles.id }).returning({ id: articles.id });
    if (!inserted.length) {
      const [existing] = await tx.select().from(articles).where(eq(articles.id, id)).limit(1);
      const [first] = await tx.select().from(articleRevisions).where(and(eq(articleRevisions.articleId, id), eq(articleRevisions.number, 1))).limit(1);
      const values = revisionValues(draft, body, authorship);
      if (!existing || existing.createdBy !== staff.id || existing.sourceSystem !== "studio" || !first || Object.entries(values).some(([key, value]) => !isDeepStrictEqual(first[key as keyof typeof first], value ?? null))) {
        throw new EditorError(409, "creation_id_reused", "Тази чернова вече е създадена с друго съдържание. Отворете записания материал.");
      }
      const requestedViews = { viewSeed: draft.viewSeed ?? null, viewEvery: draft.viewEvery ?? null, viewUnit: draft.viewUnit ?? "minutes", viewTarget: draft.viewTarget ?? null };
      const storedViews = await viewDraft(tx, id);
      if (draft.social && !isDeepStrictEqual(await readRevisionSocial(tx, id, 1, draft.title), normalizeSocial(draft.social, draft.title))) {
        throw new EditorError(409, "creation_id_reused", "Черновата е създадена с други социални настройки.");
      }
      // A key cannot silently accept different options after a lost response.
      if ((await revisionHomeHero(tx, id, 1)) !== (draft.homeHeroPosition ?? null) || requestedViews.viewSeed !== storedViews.viewSeed || requestedViews.viewTarget !== storedViews.viewTarget || intervalToSeconds(requestedViews.viewEvery, requestedViews.viewUnit) !== intervalToSeconds(storedViews.viewEvery, storedViews.viewUnit) || (await revisionListen(tx, id, 1) ?? existing.listenEnabled) !== (draft.listenEnabled ?? true) || (!existing.publishedAt && existing.scheduledPublishAt?.getTime() !== scheduleInstant(draft.publishAtSofia)?.getTime())) {
        throw new EditorError(409, "creation_id_reused", "Черновата е създадена с други настройки. Отворете записания материал.");
      }
      auditEvidence(null, null); // Idempotent retry: no new content was written.
      return { id, revision: 1 };
    }
    await validateMedia(tx, draft, body);
    await tx.insert(articleRevisions).values({ articleId: id, number: 1, createdBy: staff.id, ...revisionValues(draft, body, authorship) });
    await saveHomeHero(tx, id, 1, draft.homeHeroPosition);
    await saveListening(tx, id, 1, draft.listenEnabled, true);
    await writeRevisionSocial(tx, id, 1, draft.title, draft.social);
    const qaRun = process.env.EDITOR_QA_RUN_ID;
    if (qaRun) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(qaRun) || !draft.title.startsWith("[QA editor]") || !draft.slug.startsWith(`qa-editor-${qaRun}-`)) throw new EditorError(422, "qa_label_required", "QA режимът допуска само обозначени QA материали.");
      const ready = await tx.execute<{ ready: boolean }>(sql`select to_regclass('public.editor_qa_articles') is not null as ready`);
      if (!ready[0]?.ready) throw new EditorError(422, "migration_required", "Първо приложете миграция 30 за QA push защитата.");
      await tx.execute(sql`insert into editor_qa_articles(article_id,run_id) values(${id}::uuid,${qaRun})`);
    }
    await saveViewSettings(tx, id, draft);
    return { id, revision: 1 };
  }).then(async (created) => {
    await publishDueScheduled(getDb(), created.id);
    return created;
  });
}

export interface Conflict {
  revision: number;
  savedAt: Date;
  savedBy: string | null;
  draft: Draft;
  media: MediaOption[];
}

/** Optimistic concurrency: the save applies only on top of the revision the editor loaded. */
export async function saveRevision(staff: Staff, id: string, expectedRevision: number, draft: DraftInput): Promise<{ revision: number }> {
  return getDb().transaction(async (tx) => {
    const [article] = await tx.select().from(articles).where(eq(articles.id, id)).for("update").limit(1);
    if (!article) throw new EditorError(404, "not_found", "Статията не съществува.");
    if (draft.homeHeroPosition != null && draft.homeHeroExpectedPublishedRevision !== undefined && draft.homeHeroExpectedPublishedRevision !== article.publishedRevision) {
      throw new EditorError(409, "publication_changed", "Статията е публикувана от друг екран или по график. Презаредете я, преди да изберете нова позиция.");
    }
    if (article.publishedAt && draft.slug !== article.slug) {
      throw new EditorError(422, "slug_locked", "Адресът на публикувана статия не се сменя.");
    }
    const [latest] = await tx
      .select({ revision: articleRevisions, savedBy: staffUsers.name })
      .from(articleRevisions)
      .leftJoin(staffUsers, eq(staffUsers.id, articleRevisions.createdBy))
      .where(eq(articleRevisions.articleId, id))
      .orderBy(desc(articleRevisions.number))
      .limit(1);
    const current = latest?.revision.number ?? 0;
    if (current !== expectedRevision) {
      const conflict: Conflict = {
        revision: current,
        savedAt: latest!.revision.createdAt,
        savedBy: latest!.savedBy,
        media: await listMediaByIds([...new Set([latest!.revision.heroMediaId, ...(articleBody.safeParse(latest!.revision.body).data ?? []).flatMap(block => block.type === "image" ? [block.mediaAssetId] : [])].filter((mediaId): mediaId is string => !!mediaId))], tx),
        draft: { ...toDraft(latest!.revision).draft, social: await readRevisionSocial(tx, id, current, latest!.revision.title), homeHeroPosition: current > (article.publishedRevision ?? 0) ? await revisionHomeHero(tx, id, current) : null, listenEnabled: (await revisionListen(tx, id, current)) ?? article.listenEnabled, ...(await viewDraft(tx, id)), publishAtSofia: article.scheduledPublishAt ? utcToSofiaWall(article.scheduledPublishAt) : null },
      };
      throw new EditorError(409, "conflict", "Някой друг е записал по-нова версия.", conflict);
    }
    const number = current + 1;
    const original = latest?.revision.body ?? article.body;
    const stored = articleBody.safeParse(original);
    if (!stored.success && draft.body !== undefined) throw new EditorError(422, "body_locked", "Архивният формат се запазва без промяна. Можете да редактирате останалите полета.");
    const body = draft.body ?? (stored.success && bodyToText(stored.data) !== null ? textToBody(draft.bodyText ?? "") : original);
    await validateMedia(tx, draft, articleBody.safeParse(body).data ?? []);
    const authorship = await resolveAuthorship(tx, draft);
    const auditBefore = auditActive() ? { draft: { social: await readRevisionSocial(tx, id, current, latest?.revision.title ?? article.title), ...toDraft(latest?.revision ?? article).draft, homeHeroPosition: current > (article.publishedRevision ?? 0) ? await revisionHomeHero(tx, id, current) : null, listenEnabled: (await revisionListen(tx, id, current)) ?? article.listenEnabled, ...(await viewDraft(tx, id)), publishAtSofia: article.scheduledPublishAt ? utcToSofiaWall(article.scheduledPublishAt) : null }, revision: current } : null;
    await tx.insert(articleRevisions).values({ articleId: id, number, createdBy: staff.id, ...revisionValues(draft, body, authorship) });
    await saveHomeHero(tx, id, number, draft.homeHeroPosition);
    await saveListening(tx, id, number, draft.listenEnabled, article.listenEnabled);
    await writeRevisionSocial(tx, id, number, draft.title, draft.social, current);
    // Unpublished articles mirror the draft so lists show it; public ones keep the published text.
    await tx
      .update(articles)
      .set(
        article.publishedAt
          ? { scheduledPublishAt: null, updatedAt: new Date() }
          : {
              title: draft.title,
              excerpt: draft.excerpt,
              body,
              primaryCategoryId: draft.primaryCategoryId,
              heroMediaId: draft.heroMediaId,
              heroEmbedUrl: draft.heroEmbedUrl ?? null,
              scheduledPublishAt: scheduleInstant(draft.publishAtSofia),
              ...authorship,
              updatedAt: new Date(),
            },
      )
      .where(eq(articles.id, id));
    await saveViewSettings(tx, id, draft);
    if (article.isPublic) await refreshViewSchedule(tx, id);
    if (auditBefore) auditEvidence(auditBefore, { draft: { social: await readRevisionSocial(tx, id, number, draft.title), ...toDraft({ ...revisionValues(draft, body, authorship), heroEmbedUrl: draft.heroEmbedUrl ?? null }).draft, homeHeroPosition: draft.homeHeroPosition ?? null, listenEnabled: draft.listenEnabled ?? article.listenEnabled, ...(await viewDraft(tx, id)), publishAtSofia: article.publishedAt ? null : draft.publishAtSofia ?? null }, revision: number });
    return { revision: number };
  }).then(async (saved) => {
    await publishDueScheduled(getDb(), id);
    return saved;
  });
}

export interface PublishOutcome {
  articleId: string;
  revision: number;
  version: number;
  path: string;
  eventId: number;
  type: "article.published" | "article.updated";
  publishedAt?: string;
  duplicate?: boolean;
  homeHeroPosition?: 1 | 2 | 3 | 4 | null;
}

/**
 * Publishes one revision: public row, category link and outbox event in one
 * transaction. A repeated idempotency key returns the first outcome, so a
 * double click publishes once.
 */
export async function publishRevision(staff: Staff, id: string, revision: number, idempotencyKey: string, listenEnabled: boolean): Promise<PublishOutcome> {
  return getDb().transaction(async (tx) => {
    // Lock before inserting the FK-backed request. Two inserts otherwise both acquire
    // KEY SHARE on the article and can deadlock while upgrading to FOR UPDATE.
    const [article] = await tx.select().from(articles).where(eq(articles.id, id)).for("update").limit(1);
    if (!article) throw new EditorError(404, "not_found", "Статията не съществува.");
    const [claimed] = await tx
      .insert(publishRequests)
      .values({ idempotencyKey, articleId: id, revision, requestedBy: staff.id })
      .onConflictDoNothing()
      .returning({ key: publishRequests.idempotencyKey });
    if (!claimed) {
      const [previous] = await tx.select().from(publishRequests).where(eq(publishRequests.idempotencyKey, idempotencyKey)).limit(1);
      const previousSettings = previous?.outcome as (PublishOutcome & { listenEnabled?: boolean }) | null;
      if (!previous || previous.articleId !== id || previous.revision !== revision || (previousSettings?.listenEnabled !== undefined && previousSettings.listenEnabled !== listenEnabled)) {
        throw new EditorError(409, "idempotency_key_reused", "Ключът вече е използван за друга публикация.");
      }
      auditEvidence(null, null);
      return { ...(previous.outcome as PublishOutcome), duplicate: true };
    }

    const [rev] = await tx
      .select()
      .from(articleRevisions)
      .where(and(eq(articleRevisions.articleId, id), eq(articleRevisions.number, revision)))
      .limit(1);
    if (!rev) throw new EditorError(404, "revision_not_found", "Версията не съществува.");
    const [latest] = await tx.select({ number: articleRevisions.number }).from(articleRevisions).where(eq(articleRevisions.articleId, id)).orderBy(desc(articleRevisions.number)).limit(1);
    if (latest?.number !== revision) throw new EditorError(409, "stale_publication", "Има по-нова записана версия. Заредете я преди публикуване.");

    const body = articleBody.parse(rev.body);
    const problems = publishProblems({ ...rev, bodyBlocks: body.length });
    if (problems.length) throw new EditorError(422, "not_ready", "Статията не е готова за публикуване.", problems);
    if (!await qaPublicationAllowed(tx, id, rev.title, rev.slug)) throw new EditorError(422, "qa_push_guard_required", "QA материалът трябва първо да е регистриран за изключване от push (миграция 30).");

    const wasPublic = article.isPublic;
    if (article.publishedAt && rev.slug !== article.slug) throw new EditorError(422, "slug_locked", "Адресът на публикувана статия не се сменя.");
    await validateMedia(tx, rev, body);
    const versionListening = await revisionListen(tx, id, revision);
    if (versionListening !== null && versionListening !== listenEnabled) throw new EditorError(409, "revision_settings_changed", "Настройката за слушане се различава от записаната версия.");
    const path = articlePath(rev.slug);
    if (!wasPublic) {
      if (RESERVED_SLUGS.has(rev.slug)) throw new EditorError(409, "slug_taken", "Този адрес е запазен. Изберете друг.");
      const [takenByArticle] = await tx.select({ id: articles.id }).from(articles).where(and(eq(articles.path, path), ne(articles.id, id))).limit(1);
      const [takenByCategory] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.path, path)).limit(1);
      if (takenByArticle || takenByCategory) throw new EditorError(409, "slug_taken", "Има статия или рубрика с този адрес. Изберете друг.");
    }

    const [category] = await tx
      .select({ id: categories.id, slug: categories.slug })
      .from(categories)
      .where(eq(categories.id, rev.primaryCategoryId!))
      .limit(1);
    if (!category) throw new EditorError(422, "not_ready", "Рубриката не съществува.", ["Изберете рубрика."]);

    // Include the previous rubric so live revalidation clears both listings after a move.
    const previousSlug =
      wasPublic && article.primaryCategoryId && article.primaryCategoryId !== category.id
        ? (
            await tx
              .select({ slug: categories.slug })
              .from(categories)
              .where(eq(categories.id, article.primaryCategoryId))
              .limit(1)
          )[0]?.slug
        : null;
    const topics = [...new Set([previousSlug, category.slug].filter((slug): slug is string => !!slug))];

    const version = article.publishedAt ? article.version + 1 : article.version;
    let firstPublishedAt: Date;
    try {
      firstPublishedAt = article.publishedAt ?? resolveFirstPublishedAt(article);
    } catch (error) {
      if (error instanceof ScheduledPublishConflictError) {
        throw new EditorError(422, "scheduled_future", error.message);
      }
      throw error;
    }
    const [updated] = await tx
      .update(articles)
      .set({
        title: rev.title,
        slug: rev.slug,
        path,
        excerpt: rev.excerpt,
        body,
        heroMediaId: rev.heroMediaId,
        heroEmbedUrl: rev.heroEmbedUrl,
        authorKind: rev.authorKind,
        authorUserId: rev.authorUserId,
        authorName: rev.authorName,
        primaryCategoryId: category.id,
        isPublic: true,
        listenEnabled: versionListening ?? listenEnabled,
        publishedAt: firstPublishedAt,
        version,
        publishedRevision: revision,
        scheduledPublishAt: null,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, id))
      .returning();
    if (auditActive()) auditEvidence(publicAuditState(article), publicAuditState(updated!));

    await tx.delete(articleCategories).where(eq(articleCategories.articleId, id));
    await tx.insert(articleCategories).values({ articleId: id, categoryId: category.id });
    await applyArticlePublishViews(tx, id);

    const type = article.publishedAt ? "article.updated" : "article.published";
    await enqueueSocialPublication(tx, id, revision);
    const [event] = await tx
      .insert(outboxEvents)
      .values({ type, entityId: id, version, payload: { path: updated!.path, title: rev.title, topics } })
      .returning({ id: outboxEvents.id });

    const homeHeroPosition = revision > (article.publishedRevision ?? 0) ? await revisionHomeHero(tx, id, revision) : null;
    if (homeHeroPosition !== null) {
      if (!await hasPageArrangements(tx)) throw new EditorError(422, "migration_required", "Подреждането изисква миграция 20.");
      const placement = await publishHomeHero(tx, id, homeHeroPosition, staff.id, staff.name);
      if (auditActive()) auditEvidence({ article: publicAuditState(article), homeArrangement: placement.before }, { article: publicAuditState(updated!), homeArrangement: placement.after });
    }
    const outcome: PublishOutcome & { listenEnabled: boolean } = {
      articleId: id,
      revision,
      version,
      path: updated!.path,
      eventId: event!.id,
      type,
      ...(updated!.publishedAt ? { publishedAt: updated!.publishedAt.toISOString() } : {}),
      homeHeroPosition,
      listenEnabled: versionListening ?? listenEnabled,
    };
    await tx.update(publishRequests).set({ outcome }).where(eq(publishRequests.idempotencyKey, idempotencyKey));
    return outcome;
  }).then(async outcome => {
    // Immediate refresh after commit; the durable layout outbox remains the retry path.
    if (outcome.homeHeroPosition != null) await triggerRevalidate(["/"]);
    return outcome;
  });
}

/** Shows or hides an already published article on the public site. Drafts stay in the editor. */
export async function setArticleVisibility(id: string, visible: boolean, actor?: { id: string; name: string }): Promise<{ isPublic: boolean }> {
  const result = await getDb().transaction(async (tx) => {
    const [article] = await tx.select().from(articles).where(eq(articles.id, id)).for("update").limit(1);
    if (!article) throw new EditorError(404, "not_found", "Статията не съществува.");
    const [category] = article.primaryCategoryId
      ? await tx.select({ slug: categories.slug, path: categories.path }).from(categories).where(eq(categories.id, article.primaryCategoryId)).limit(1)
      : [];
    const paths = ["/", article.path, category?.path, "/feed/", "/sitemap.xml", "/llms.txt"].filter((path): path is string => !!path);
    if (article.isPublic === visible) { auditEvidence({ isPublic: article.isPublic }, { isPublic: article.isPublic }); return { isPublic: article.isPublic, paths }; }
    if (visible && !article.publishedAt) {
      throw new EditorError(422, "not_published", "Статията още не е публикувана. Пуснете я от редактора.");
    }
    const version = article.version + 1;
    await tx.update(articles).set({ isPublic: visible, version, updatedAt: new Date() }).where(eq(articles.id, id));
    auditEvidence({ isPublic: article.isPublic, title: article.title }, { isPublic: visible, title: article.title });
    await tx.insert(outboxEvents).values({
      type: "article.updated",
      entityId: id,
      version,
      payload: {
        path: article.path,
        title: article.title,
        topics: category ? [category.slug] : [],
        visibilityChange: { visible, actorId: actor?.id ?? null, actorName: actor?.name ?? null },
      },
    });
    if (await hasArticleViewBoosts(tx)) {
      if (visible) await refreshViewSchedule(tx, id);
      else await tx.update(articleViewBoosts).set({ nextIncrementAt: null, updatedAt: new Date() }).where(eq(articleViewBoosts.articleId, id));
    }
    return { isPublic: visible, paths };
  });
  // Refresh only after commit, including idempotent retries; outbox remains the durable path.
  await triggerRevalidate([...new Set(result.paths)]);
  return { isPublic: result.isPublic };
}

async function purgeArticlePlacements(tx: Pick<ReturnType<typeof getDb>, "select" | "update" | "execute">, articleId: string) {
  if (!await hasPageArrangements(tx as ReturnType<typeof getDb>)) return;
  await lockArrangements(tx);
  const rows = await tx
    .select({ id: pageArrangements.id, document: pageArrangements.document })
    .from(pageArrangements)
    .where(inArray(pageArrangements.status, ["draft", "published"]));
  for (const row of rows) {
    const current = readArrangementDocument(row.document);
    const next = removeArticleFromArrangement(current, articleId);
    if (!isDeepStrictEqual(current, next)) {
      await tx.update(pageArrangements).set({ document: next }).where(eq(pageArrangements.id, row.id));
    }
  }
}

/** Permanently removes a material and its public URL. Irreversible. */
export async function deleteArticle(_staff: Staff, id: string): Promise<{ id: string }> {
  const result = await getDb().transaction(async (tx) => {
    const [article] = await tx.select().from(articles).where(eq(articles.id, id)).for("update").limit(1);
    if (!article) throw new EditorError(404, "not_found", "Статията не съществува.");
    const [category] = article.primaryCategoryId
      ? await tx.select({ path: categories.path }).from(categories).where(eq(categories.id, article.primaryCategoryId)).limit(1)
      : [];
    auditEvidence({ article: publicAuditState(article) }, null);
    await purgeArticlePlacements(tx, id);
    await tx.delete(editorQaArticles).where(eq(editorQaArticles.articleId, id));
    await tx.delete(articles).where(eq(articles.id, id));
    return { path: article.path, categoryPath: category?.path ?? null, title: article.title };
  });
  const paths = [...new Set(["/", result.path, result.categoryPath, "/sitemap.xml", "/feed/"].filter((path): path is string => !!path))];
  await triggerRevalidate(paths);
  return { id };
}

/** Rendered preview data for Studio only; never served by the public site. */
export async function getPreview(id: string, revision?: number) {
  const db = getDb();
  const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!article) return null;
  const [rev] = await db
    .select()
    .from(articleRevisions)
    .where(revision ? and(eq(articleRevisions.articleId, id), eq(articleRevisions.number, revision)) : eq(articleRevisions.articleId, id))
    .orderBy(desc(articleRevisions.number))
    .limit(1);
  const source = rev ?? article;
  const body = articleBody.safeParse(source.body);
  const blocks = body.success ? body.data : [];
  const imageIds = [...new Set(blocks.flatMap((block) => (block.type === "image" ? [block.mediaAssetId] : [])))];
  const [category] = source.primaryCategoryId
    ? await db.select({ name: categories.name }).from(categories).where(eq(categories.id, source.primaryCategoryId)).limit(1)
    : [];
  const [hero] = source.heroMediaId ? await listMediaByIds([source.heroMediaId]) : [];
  return {
    title: source.title,
    excerpt: source.excerpt,
    body: blocks,
    category: category?.name ?? null,
    hero: hero ?? null,
    heroEmbedUrl: source.heroEmbedUrl ?? null,
    media: imageIds.length ? await listMediaByIds(imageIds) : [],
    authorName: source.authorName,
    publishedAt: article.publishedAt,
    revision: rev?.number ?? null,
    isPublic: article.isPublic,
  };
}

export async function listRevisionHistory(id: string) {
  const db = getDb();
  const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!article) throw new EditorError(404, "not_found", "Статията не съществува.");
  const rows = await db.select({ revision: articleRevisions, savedBy: staffUsers.name }).from(articleRevisions)
    .leftJoin(staffUsers, eq(staffUsers.id, articleRevisions.createdBy))
    .where(eq(articleRevisions.articleId, id)).orderBy(desc(articleRevisions.number)).limit(50);
  const revisions = await Promise.all(rows.map(async ({ revision, savedBy }) => {
    const parsed = toDraft(revision);
    parsed.draft.homeHeroPosition = await revisionHomeHero(db, id, revision.number);
    parsed.draft.social = await readRevisionSocial(db, id, revision.number, revision.title);
    return {
    number: revision.number, savedAt: revision.createdAt, savedBy,
    ...parsed,
    listenEnabled: (await revisionListen(db, id, revision.number)) ?? article.listenEnabled,
    };
  }));
  const ids = [...new Set(revisions.flatMap(item => [item.draft.heroMediaId, ...(item.draft.body ?? []).flatMap(block => block.type === "image" ? [block.mediaAssetId] : [])]).filter((value): value is string => !!value))];
  return { revisions, media: ids.length ? await listMediaByIds(ids) : [] };
}

async function listMediaByIds(ids: string[], db: Pick<ReturnType<typeof getDb>, "select"> = getDb()): Promise<MediaOption[]> {
  const rows = await db.select().from(mediaAssets).where(inArray(mediaAssets.id, ids));
  return rows.map((row) => ({
    id: row.id,
    url: row.storageKey ? libraryImageUrl(row.storageKey, row.sourceUrl) : resolveMediaUrl({ provider: row.provider, sourceUrl: row.sourceUrl, storageKey: row.storageKey }),
    alt: row.alt,
    caption: row.caption, credit: row.credit, width: row.width, height: row.height,
  }));
}
