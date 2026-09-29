import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "@newspoint/db/orm";
import { articleBody, resolveMediaUrl, type ArticleBody } from "@newspoint/content";
import {
  articleCategories,
  articleRevisions,
  articles,
  categories,
  getDb,
  mediaAssets,
  outboxEvents,
  publishRequests,
  staffUsers,
  type ArticleAuthorKind,
} from "@newspoint/db";
import { bodyToText, textToBody } from "./editor/body";
import type { DraftInput } from "./editor/input";
import { publishProblems } from "./editor/input";
import { articlePath } from "./editor/slug";
import type { Staff } from "./session";

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
const RESERVED_SLUGS = new Set(["api", "_next", "brand", "draft", "login", "search", "tag", "author", "page", "feed", "wp-admin", "wp-content", "wp-json"]);

const draftPath = (id: string) => `/draft/${id}/`;

export interface Draft {
  title: string;
  slug: string;
  excerpt: string;
  bodyText: string;
  primaryCategoryId: string | null;
  heroMediaId: string | null;
  authorKind: ArticleAuthorKind;
  authorUserId: string | null;
  authorName: string;
}

export interface EditorArticle {
  id: string;
  sourceSystem: "wordpress" | "studio";
  isPublic: boolean;
  path: string;
  authorName: string;
  publishedAt: Date | null;
  publishedRevision: number | null;
  revision: number;
  revisionSavedAt: Date | null;
  revisionSavedBy: string | null;
  draft: Draft;
  /** False for imported bodies the text editor cannot represent. */
  editableBody: boolean;
  /** Every role writes and publishes; only Studio articles with a plain-text body are editable. */
  canEdit: boolean;
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
}

/** Only existing MediaAssets can be chosen (DEC-104); uploads come later. */
export async function listRecentMedia(limit = 48, include: string | null = null): Promise<MediaOption[]> {
  const db = getDb();
  const rows = await db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt)).limit(limit);
  if (include && !rows.some((row) => row.id === include)) {
    rows.unshift(...(await db.select().from(mediaAssets).where(eq(mediaAssets.id, include))));
  }
  return rows.map((row) => ({
    id: row.id,
    url: resolveMediaUrl({ provider: row.provider, sourceUrl: row.sourceUrl, storageKey: row.storageKey }),
    alt: row.alt,
  }));
}

function toDraft(row: {
  title: string;
  slug: string;
  excerpt: string;
  body: unknown;
  primaryCategoryId: string | null;
  heroMediaId: string | null;
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
      primaryCategoryId: row.primaryCategoryId,
      heroMediaId: row.heroMediaId,
      authorKind,
      authorUserId: authorKind === "staff" ? row.authorUserId : null,
      authorName: row.authorName,
    },
    editableBody: text !== null,
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
  const isStudio = article.sourceSystem === "studio";
  return {
    id: article.id,
    sourceSystem: article.sourceSystem,
    isPublic: article.isPublic,
    path: article.path,
    authorName: article.authorName,
    publishedAt: article.publishedAt,
    publishedRevision: article.publishedRevision,
    revision: latest?.revision.number ?? 0,
    revisionSavedAt: latest?.revision.createdAt ?? null,
    revisionSavedBy: latest?.savedBy ?? null,
    draft,
    editableBody,
    canEdit: isStudio && editableBody,
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

function revisionValues(draft: DraftInput, body: ArticleBody, authorship: Authorship) {
  return {
    title: draft.title,
    slug: draft.slug,
    excerpt: draft.excerpt,
    body,
    primaryCategoryId: draft.primaryCategoryId,
    heroMediaId: draft.heroMediaId,
    ...authorship,
  };
}

export async function createArticle(staff: Staff, draft: DraftInput): Promise<{ id: string; revision: number }> {
  const body = textToBody(draft.bodyText);
  const authorship = resolveAuthorship(staff, draft);
  return getDb().transaction(async (tx) => {
    const id = crypto.randomUUID();
    await tx.insert(articles).values({
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
      isPublic: false,
      createdBy: staff.id,
    });
    await tx.insert(articleRevisions).values({ articleId: id, number: 1, createdBy: staff.id, ...revisionValues(draft, body, authorship) });
    return { id, revision: 1 };
  });
}

export interface Conflict {
  revision: number;
  savedAt: Date;
  savedBy: string | null;
  draft: Draft;
}

/** Optimistic concurrency: the save applies only on top of the revision the editor loaded. */
export async function saveRevision(staff: Staff, id: string, expectedRevision: number, draft: DraftInput): Promise<{ revision: number }> {
  const body = textToBody(draft.bodyText);
  return getDb().transaction(async (tx) => {
    const [article] = await tx.select().from(articles).where(eq(articles.id, id)).for("update").limit(1);
    if (!article) throw new EditorError(404, "not_found", "Статията не съществува.");
    if (article.sourceSystem !== "studio") {
      throw new EditorError(403, "forbidden", "Импортираните статии не се редактират от Studio.");
    }
    if (article.isPublic && draft.slug !== article.slug) {
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
        draft: toDraft(latest!.revision).draft,
      };
      throw new EditorError(409, "conflict", "Някой друг е записал по-нова версия.", conflict);
    }
    const number = current + 1;
    const authorship = resolveAuthorship(staff, draft, latest?.revision);
    await tx.insert(articleRevisions).values({ articleId: id, number, createdBy: staff.id, ...revisionValues(draft, body, authorship) });
    // Unpublished articles mirror the draft so lists show it; public ones keep the published text.
    await tx
      .update(articles)
      .set(
        article.isPublic
          ? { updatedAt: new Date() }
          : {
              title: draft.title,
              excerpt: draft.excerpt,
              body,
              primaryCategoryId: draft.primaryCategoryId,
              heroMediaId: draft.heroMediaId,
              ...authorship,
              updatedAt: new Date(),
            },
      )
      .where(eq(articles.id, id));
    return { revision: number };
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
export async function publishRevision(staff: Staff, id: string, revision: number, idempotencyKey: string): Promise<PublishOutcome> {
  return getDb().transaction(async (tx) => {
    const [claimed] = await tx
      .insert(publishRequests)
      .values({ idempotencyKey, articleId: id, revision, requestedBy: staff.id })
      .onConflictDoNothing()
      .returning({ key: publishRequests.idempotencyKey });
    if (!claimed) {
      const [previous] = await tx.select().from(publishRequests).where(eq(publishRequests.idempotencyKey, idempotencyKey)).limit(1);
      if (!previous || previous.articleId !== id || previous.revision !== revision) {
        throw new EditorError(409, "idempotency_key_reused", "Ключът вече е използван за друга публикация.");
      }
      return { ...(previous.outcome as PublishOutcome), duplicate: true };
    }

    const [article] = await tx.select().from(articles).where(eq(articles.id, id)).for("update").limit(1);
    if (!article) throw new EditorError(404, "not_found", "Статията не съществува.");
    if (article.sourceSystem !== "studio") throw new EditorError(403, "forbidden", "Импортираните статии не се публикуват от Studio.");
    const [rev] = await tx
      .select()
      .from(articleRevisions)
      .where(and(eq(articleRevisions.articleId, id), eq(articleRevisions.number, revision)))
      .limit(1);
    if (!rev) throw new EditorError(404, "revision_not_found", "Версията не съществува.");

    const body = articleBody.parse(rev.body);
    const problems = publishProblems({ ...rev, bodyBlocks: body.length });
    if (problems.length) throw new EditorError(422, "not_ready", "Статията не е готова за публикуване.", problems);

    const wasPublic = article.isPublic;
    if (wasPublic && rev.slug !== article.slug) throw new EditorError(422, "slug_locked", "Адресът на публикувана статия не се сменя.");
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

    const version = wasPublic ? article.version + 1 : article.version;
    const [updated] = await tx
      .update(articles)
      .set({
        title: rev.title,
        slug: rev.slug,
        path,
        excerpt: rev.excerpt,
        body,
        heroMediaId: rev.heroMediaId,
        authorKind: rev.authorKind,
        authorUserId: rev.authorUserId,
        authorName: rev.authorName,
        primaryCategoryId: category.id,
        isPublic: true,
        publishedAt: article.publishedAt ?? sql`now()`,
        version,
        publishedRevision: revision,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, id))
      .returning({ path: articles.path });

    await tx.delete(articleCategories).where(eq(articleCategories.articleId, id));
    await tx.insert(articleCategories).values({ articleId: id, categoryId: category.id });

    const type = wasPublic ? "article.updated" : "article.published";
    const [event] = await tx
      .insert(outboxEvents)
      .values({ type, entityId: id, version, payload: { path: updated!.path, title: rev.title, topics: [category.slug] } })
      .returning({ id: outboxEvents.id });

    const outcome: PublishOutcome = { articleId: id, revision, version, path: updated!.path, eventId: event!.id, type };
    await tx.update(publishRequests).set({ outcome }).where(eq(publishRequests.idempotencyKey, idempotencyKey));
    return outcome;
  });
}

/** Shows or hides an already published article on the public site. Drafts stay in the editor. */
export async function setArticleVisibility(id: string, visible: boolean): Promise<{ isPublic: boolean }> {
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
      payload: { path: article.path, title: article.title, topics: category ? [category.slug] : [] },
    });
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
  const [category] = source.primaryCategoryId
    ? await db.select({ name: categories.name }).from(categories).where(eq(categories.id, source.primaryCategoryId)).limit(1)
    : [];
  const [hero] = source.heroMediaId ? await listMediaByIds([source.heroMediaId]) : [];
  return {
    title: source.title,
    excerpt: source.excerpt,
    body: body.success ? body.data : [],
    category: category?.name ?? null,
    hero: hero ?? null,
    authorName: source.authorName,
    publishedAt: article.publishedAt,
    revision: rev?.number ?? null,
    isPublic: article.isPublic,
  };
}

async function listMediaByIds(ids: string[]): Promise<MediaOption[]> {
  const rows = await getDb().select().from(mediaAssets).where(inArray(mediaAssets.id, ids));
  return rows.map((row) => ({
    id: row.id,
    url: resolveMediaUrl({ provider: row.provider, sourceUrl: row.sourceUrl, storageKey: row.storageKey }),
    alt: row.alt,
  }));
}
