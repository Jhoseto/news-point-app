import "server-only";
import { isDeepStrictEqual } from "node:util";
import { and, asc, desc, eq, inArray, ne, sql } from "@newspoint/db/orm";
import { articleBody, resolveMediaUrl, sofiaWallToUtc, utcToSofiaWall, RESERVED_ARTICLE_SLUGS, type ArticleBody } from "@newspoint/content";
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
  hasRevisionListen,
  revisionListen,
  writeRevisionListen,
  qaPublicationAllowed,
  mediaAssets,
  outboxEvents,
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

export interface Draft {
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
  updatedAt: Date;
  categoryName: string | null;
  authorName: string | null;
  hasUnpublishedChanges: boolean;
  readCount: number | null;
  addedCount: number | null;
}

export async function listSections() {
  return getDb()
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .where(eq(categories.kind, "section"))
    .orderBy(desc(categories.inMenu), asc(categories.menuOrder), asc(categories.name));
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
  const rows = await db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt)).limit(limit);
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
      viewUnit: "minutes",
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
  draft.listenEnabled = latest ? (await revisionListen(db, id, latest.revision.number)) ?? article.listenEnabled : article.listenEnabled;
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

function resolveAuthorship(staff: Staff, draft: DraftInput, preserved?: Authorship): Authorship {
  if (draft.authorKind === "newsroom") return { authorKind: "newsroom", authorUserId: null, authorName: "NewsPoint.bg" };
  if (draft.authorKind === "manual") return { authorKind: "manual", authorUserId: null, authorName: draft.authorName.trim() };
  if (draft.authorUserId === staff.id) return { authorKind: "staff", authorUserId: staff.id, authorName: staff.name };
  if (preserved?.authorKind === "staff" && preserved.authorUserId === draft.authorUserId) return preserved;
  throw new EditorError(422, "invalid_author", "Изберете валиден авторски профил.");
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
  const authorship = resolveAuthorship(staff, draft);
  return getDb().transaction(async (tx) => {
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
      // A key cannot silently accept different options after a lost response.
      if (requestedViews.viewSeed !== storedViews.viewSeed || requestedViews.viewTarget !== storedViews.viewTarget || intervalToSeconds(requestedViews.viewEvery, requestedViews.viewUnit) !== intervalToSeconds(storedViews.viewEvery, storedViews.viewUnit) || (await revisionListen(tx, id, 1) ?? existing.listenEnabled) !== (draft.listenEnabled ?? true) || (!existing.publishedAt && existing.scheduledPublishAt?.getTime() !== scheduleInstant(draft.publishAtSofia)?.getTime())) {
        throw new EditorError(409, "creation_id_reused", "Черновата е създадена с други настройки. Отворете записания материал.");
      }
      return { id, revision: 1 };
    }
    await validateMedia(tx, draft, body);
    await tx.insert(articleRevisions).values({ articleId: id, number: 1, createdBy: staff.id, ...revisionValues(draft, body, authorship) });
    await saveListening(tx, id, 1, draft.listenEnabled, true);
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
        draft: { ...toDraft(latest!.revision).draft, listenEnabled: (await revisionListen(tx, id, current)) ?? article.listenEnabled, ...(await viewDraft(tx, id)), publishAtSofia: article.scheduledPublishAt ? utcToSofiaWall(article.scheduledPublishAt) : null },
      };
      throw new EditorError(409, "conflict", "Някой друг е записал по-нова версия.", conflict);
    }
    const number = current + 1;
    const original = latest?.revision.body ?? article.body;
    const stored = articleBody.safeParse(original);
    if (!stored.success && draft.body !== undefined) throw new EditorError(422, "body_locked", "Архивният формат се запазва без промяна. Можете да редактирате останалите полета.");
    const body = draft.body ?? (stored.success && bodyToText(stored.data) !== null ? textToBody(draft.bodyText ?? "") : original);
    await validateMedia(tx, draft, articleBody.safeParse(body).data ?? []);
    const authorship = resolveAuthorship(staff, draft, latest?.revision ?? article);
    await tx.insert(articleRevisions).values({ articleId: id, number, createdBy: staff.id, ...revisionValues(draft, body, authorship) });
    await saveListening(tx, id, number, draft.listenEnabled, article.listenEnabled);
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
  duplicate?: boolean;
}

/**
 * Publishes one revision: public row, category link and outbox event in one
 * transaction. A repeated idempotency key returns the first outcome, so a
 * double click publishes once.
 */
export async function publishRevision(staff: Staff, id: string, revision: number, idempotencyKey: string, listenEnabled: boolean): Promise<PublishOutcome> {
  return getDb().transaction(async (tx) => {
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
      return { ...(previous.outcome as PublishOutcome), duplicate: true };
    }

    const [article] = await tx.select().from(articles).where(eq(articles.id, id)).for("update").limit(1);
    if (!article) throw new EditorError(404, "not_found", "Статията не съществува.");
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
        publishedAt: article.publishedAt ?? sql`now()`,
        version,
        publishedRevision: revision,
        scheduledPublishAt: null,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, id))
      .returning({ path: articles.path });

    await tx.delete(articleCategories).where(eq(articleCategories.articleId, id));
    await tx.insert(articleCategories).values({ articleId: id, categoryId: category.id });
    await applyArticlePublishViews(tx, id);

    const type = article.publishedAt ? "article.updated" : "article.published";
    const [event] = await tx
      .insert(outboxEvents)
      .values({ type, entityId: id, version, payload: { path: updated!.path, title: rev.title, topics } })
      .returning({ id: outboxEvents.id });

    const outcome: PublishOutcome & { listenEnabled: boolean } = { articleId: id, revision, version, path: updated!.path, eventId: event!.id, type, listenEnabled: versionListening ?? listenEnabled };
    await tx.update(publishRequests).set({ outcome }).where(eq(publishRequests.idempotencyKey, idempotencyKey));
    return outcome;
  });
}

/** Shows or hides an already published article on the public site. Drafts stay in the editor. */
export async function setArticleVisibility(id: string, visible: boolean, actor?: { id: string; name: string }): Promise<{ isPublic: boolean }> {
  return getDb().transaction(async (tx) => {
    const [article] = await tx.select().from(articles).where(eq(articles.id, id)).for("update").limit(1);
    if (!article) throw new EditorError(404, "not_found", "Статията не съществува.");
    if (article.isPublic === visible) return { isPublic: article.isPublic };
    if (visible && !article.publishedAt) {
      throw new EditorError(422, "not_published", "Статията още не е публикувана. Пуснете я от редактора.");
    }
    const version = article.version + 1;
    await tx.update(articles).set({ isPublic: visible, version, updatedAt: new Date() }).where(eq(articles.id, id));
    const [category] = article.primaryCategoryId
      ? await tx.select({ slug: categories.slug }).from(categories).where(eq(categories.id, article.primaryCategoryId)).limit(1)
      : [];
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
    return { isPublic: visible };
  });
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
  const revisions = await Promise.all(rows.map(async ({ revision, savedBy }) => ({
    number: revision.number, savedAt: revision.createdAt, savedBy,
    ...toDraft(revision),
    listenEnabled: (await revisionListen(db, id, revision.number)) ?? article.listenEnabled,
  })));
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
