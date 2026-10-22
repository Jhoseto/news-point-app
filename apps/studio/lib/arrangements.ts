import { auditEvidence } from "./audit-context";
import "server-only";
import { and, desc, eq, ilike, inArray, sql } from "@newspoint/db/orm";
import {
  HOME_PAGE_KEY,
  PUBLIC_MENU,
  emptyArrangement,
  referencedArticleIds,
  sanitizeArrangement,
  withVoiceCarouselSlots,
  resolveMediaUrl,
  triggerRevalidate,
  type ArrangementDocument,
} from "@newspoint/content";
import { arrangementState, lockArrangements, writeArrangementDraft, writePublishedArrangement, type ArrangementTx, readArrangementDocument as readDocument, articles, categories, getDb, hasPageArrangements, pageArrangements } from "@newspoint/db";
import { EditorError } from "./articles";
import type { ArrangementArticle, ArrangementHistoryItem, MenuCategory } from "./arrangement-types";
import type { Staff } from "./session";
import { mediaAssets } from "@newspoint/db";
import { libraryImageUrl } from "./media-library";

const placementFields = {
  id: articles.id, title: articles.title, categoryName: categories.name, isPublic: articles.isPublic,
  media: { provider: mediaAssets.provider, storageKey: mediaAssets.storageKey, sourceUrl: mediaAssets.sourceUrl },
};

function withPlacementImage({ media, ...article }: Omit<ArrangementArticle, "imageUrl"> & {
  media: Pick<typeof mediaAssets.$inferSelect, "provider" | "storageKey" | "sourceUrl"> | null;
}): ArrangementArticle {
  return { ...article, imageUrl: media ? (media.storageKey ? libraryImageUrl(media.storageKey, media.sourceUrl) : resolveMediaUrl(media)) : null };
}

export type { ArrangementArticle, ArrangementHistoryItem, MenuCategory };

const HISTORY_LIMIT = 15;

export async function arrangementReady(): Promise<boolean> {
  return hasPageArrangements(getDb());
}

export async function menuCategories(): Promise<MenuCategory[]> {
  const slugs = PUBLIC_MENU.map((entry) => entry.slug);
  const rows = await getDb()
    .select({ id: categories.id, slug: categories.slug, name: categories.name, path: categories.path })
    .from(categories)
    .where(inArray(categories.slug, slugs));
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return PUBLIC_MENU.flatMap((entry) => {
    const row = bySlug.get(entry.slug);
    return row ? [{ ...row, name: entry.name }] : [];
  });
}

function pageOf(pageKey: string, menu: MenuCategory[]): { key: string; path: string; title: string; categories: { slug: string; name: string }[] } {
  if (pageKey === HOME_PAGE_KEY) return { key: HOME_PAGE_KEY, path: "/", title: "Начало", categories: menu };
  const category = menu.find((item) => item.id === pageKey);
  if (!category) throw new EditorError(404, "not_found", "Няма такава страница.");
  return { key: category.id, path: category.path, title: category.name, categories: menu };
}

function stamp(next: ArrangementDocument, previous: ArrangementDocument, name: string): ArrangementDocument {
  const now = new Date().toISOString();
  const slots: ArrangementDocument["slots"] = {};
  for (const [key, slot] of Object.entries(next.slots)) {
    const oldItems = previous.slots[key]?.items ?? [];
    slots[key] = {
      items: slot.items.map((item) => {
        const kept = oldItems.find((old) => old.articleId === item.articleId && old.startsAt === item.startsAt && old.endsAt === item.endsAt && old.placedBy);
        return kept ? { ...item, placedBy: kept.placedBy, placedAt: kept.placedAt } : { ...item, placedBy: name, placedAt: now };
      }),
    };
  }
  return { slots, excluded: next.excluded };
}

async function articleMap(ids: string[]): Promise<Record<string, ArrangementArticle>> {
  if (!ids.length) return {};
  const rows = await getDb()
    .select(placementFields)
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, articles.heroMediaId))
    .where(inArray(articles.id, ids));
  return Object.fromEntries(rows.map((row) => [row.id, withPlacementImage(row)]));
}

async function requireReady() {
  if (!await arrangementReady()) throw new EditorError(422, "not_ready", "Приложете миграция 20_page_arrangements.sql и презаредете.");
}

export async function loadArrangement(pageKey: string): Promise<{
  ready: boolean;
  version: string;
  menu: MenuCategory[];
  pageKey: string;
  draft: ArrangementDocument;
  note: string;
  published: ArrangementDocument;
  history: ArrangementHistoryItem[];
  articles: Record<string, ArrangementArticle>;
}> {
  const menu = await menuCategories();
  const ready = await arrangementReady();
  if (!ready) {
    return { ready, version: "", menu, pageKey: HOME_PAGE_KEY, draft: emptyArrangement(), note: "", published: emptyArrangement(), history: [], articles: {} };
  }
  const page = pageOf(pageKey, menu);
  const db = getDb();
  const [state, historyRows] = await Promise.all([
    arrangementState(db, page.key),
    db.select({ id: pageArrangements.id, publishedAt: pageArrangements.publishedAt, note: pageArrangements.note })
      .from(pageArrangements)
      .where(and(eq(pageArrangements.pageKey, page.key), eq(pageArrangements.status, "history")))
      .orderBy(desc(pageArrangements.createdAt))
      .limit(HISTORY_LIMIT),
  ]);
  const published = withVoiceCarouselSlots(readDocument(state.published?.document));
  const draft = state.draft ? withVoiceCarouselSlots(readDocument(state.draft.document)) : published;
  const articles = await articleMap([...new Set([...referencedArticleIds(draft), ...referencedArticleIds(published)])]);
  return {
    ready,
    version: state.version,
    menu,
    pageKey: page.key,
    draft,
    note: state.draft?.note ?? state.published?.note ?? "",
    published,
    history: historyRows.map((row) => ({ id: row.id, publishedAt: row.publishedAt?.toISOString() ?? null, note: row.note })),
    articles,
  };
}

async function checkedState(tx: ArrangementTx, pageKey: string, expectedVersion?: string) {
  await lockArrangements(tx);
  const state = await arrangementState(tx, pageKey);
  if (expectedVersion !== undefined && state.version !== expectedVersion) throw new EditorError(409, "arrangement_conflict", "Подреждането е променено от друг екран или публикация. Презаредете страницата, преди да записвате.");
  return state;
}

export async function saveArrangement(staff: Staff, pageKey: string, document: ArrangementDocument, note: string, expectedVersion?: string): Promise<{ version: string }> {
  await requireReady();
  const page = pageOf(pageKey, await menuCategories());
  const clean = sanitizeArrangement(page.key, withVoiceCarouselSlots(document), page.categories);
  return getDb().transaction(async tx => {
    const state = await checkedState(tx, page.key, expectedVersion);
    const previous = readDocument(state.draft?.document ?? state.published?.document);
    const stamped = stamp(clean, previous, staff.name);
    const trimmedNote = note.trim().slice(0, 400);
    auditEvidence({ document: previous, note: state.draft?.note ?? "" }, { document: stamped, note: trimmedNote });
    await writeArrangementDraft(tx, page.key, stamped, trimmedNote, staff.id);
    return { version: (await arrangementState(tx, page.key)).version };
  });
}

export async function publishArrangement(staff: Staff, pageKey: string, expectedVersion?: string): Promise<{ path: string; version: string }> {
  await requireReady();
  const page = pageOf(pageKey, await menuCategories());
  const result = await getDb().transaction(async tx => {
    const state = await checkedState(tx, page.key, expectedVersion);
    if (!state.draft) throw new EditorError(422, "not_ready", "Първо запазете подреждането.");
    auditEvidence({ document: state.published?.document ?? emptyArrangement() }, { document: state.draft.document });
    await writePublishedArrangement(tx, page.key, readDocument(state.draft.document), state.draft.note, staff.id, page.path, page.title);
    return { path: page.path, version: (await arrangementState(tx, page.key)).version };
  });
  await triggerRevalidate([page.path]);
  return result;
}

export async function revertArrangement(staff: Staff, pageKey: string, historyId: string, expectedVersion?: string): Promise<{ version: string }> {
  await requireReady();
  const page = pageOf(pageKey, await menuCategories());
  const result = await getDb().transaction(async tx => {
    const state = await checkedState(tx, page.key, expectedVersion);
    const [history] = await tx.select().from(pageArrangements).where(and(eq(pageArrangements.id, historyId), eq(pageArrangements.pageKey, page.key), eq(pageArrangements.status, "history"))).limit(1);
    if (!history) throw new EditorError(404, "not_found", "Това подреждане вече го няма.");
    auditEvidence({ document: state.published?.document ?? emptyArrangement() }, { document: history.document });
    await writePublishedArrangement(tx, page.key, readDocument(history.document), history.note, staff.id, page.path, page.title);
    await writeArrangementDraft(tx, page.key, readDocument(history.document), history.note, staff.id);
    return { version: (await arrangementState(tx, page.key)).version };
  });
  await triggerRevalidate([page.path]);
  return result;
}

export async function placeArticle(staff: Staff, input: { pageKey: string; slot: string; articleId: string; hours: number | null; publish?: boolean; expectedVersion?: string }): Promise<{ version: string; path: string }> {
  await requireReady();
  const page = pageOf(input.pageKey, await menuCategories());
  const probe = sanitizeArrangement(page.key, { slots: { [input.slot]: { items: [{ articleId: input.articleId, startsAt: null, endsAt: null, placedBy: "", placedAt: null }] } }, excluded: [] }, page.categories);
  if (!probe.slots[input.slot]) throw new EditorError(422, "invalid_input", "Няма такова място.");
  const result = await getDb().transaction(async tx => {
    // Lock the article first: this is also the ordering used by publish and delete.
    const [article] = await tx.select({ id: articles.id, isPublic: articles.isPublic }).from(articles).where(eq(articles.id, input.articleId)).for("update").limit(1);
    if (!article?.isPublic) throw new EditorError(422, "not_ready", "На място се слага само публикувана новина.");
    const state = await checkedState(tx, page.key, input.expectedVersion);
    const at = new Date().toISOString();
    const endsAt = input.hours === null ? null : new Date(Date.now() + input.hours * 3600000).toISOString();
    const patch = (base: ArrangementDocument): ArrangementDocument => ({ ...base, slots: { ...base.slots, [input.slot]: { items: [{ articleId: input.articleId, startsAt: null, endsAt, placedBy: staff.name, placedAt: at }, ...(base.slots[input.slot]?.items.filter(item => item.articleId !== input.articleId) ?? [])].slice(0, 6) } } });
    const before = readDocument(state.draft?.document ?? state.published?.document);
    const draft = patch(before);
    await writeArrangementDraft(tx, page.key, draft, state.draft?.note ?? state.published?.note ?? "", staff.id);
    if (input.publish) await writePublishedArrangement(tx, page.key, patch(readDocument(state.published?.document)), state.published?.note ?? "", staff.id, page.path, page.title);
    auditEvidence({ document: before }, { document: draft });
    return { version: (await arrangementState(tx, page.key)).version, path: page.path };
  });
  if (input.publish) await triggerRevalidate([page.path]);
  return result;
}

export async function searchPlacementArticles(query: string): Promise<ArrangementArticle[]> {
  const term = query.trim().slice(0, 80);
  if (term.length < 2) return [];
  const rows = await getDb()
    .select(placementFields)
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, articles.heroMediaId))
    .where(and(eq(articles.isPublic, true), sql`${articles.publishedAt} <= now()`, ilike(articles.title, `%${term.replace(/[%_]/g, "")}%`)))
    .orderBy(desc(articles.publishedAt))
    .limit(12);
  return rows.map(withPlacementImage);
}
