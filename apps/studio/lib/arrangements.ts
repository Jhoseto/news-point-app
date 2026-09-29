import "server-only";
import { and, desc, eq, ilike, inArray } from "@newspoint/db/orm";
import {
  HOME_PAGE_KEY,
  PUBLIC_MENU,
  arrangementDocumentSchema,
  emptyArrangement,
  referencedArticleIds,
  sanitizeArrangement,
  type ArrangementDocument,
} from "@newspoint/content";
import { articles, categories, getDb, hasPageArrangements, outboxEvents, pageArrangements } from "@newspoint/db";
import { EditorError } from "./articles";
import type { ArrangementArticle, ArrangementHistoryItem, MenuCategory } from "./arrangement-types";
import type { Staff } from "./session";

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

function readDocument(value: unknown): ArrangementDocument {
  const parsed = arrangementDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyArrangement();
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
    .select({ id: articles.id, title: articles.title, categoryName: categories.name, isPublic: articles.isPublic })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .where(inArray(articles.id, ids));
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

async function requireReady() {
  if (!await arrangementReady()) throw new EditorError(422, "not_ready", "Приложете миграция 20_page_arrangements.sql и презаредете.");
}

export async function loadArrangement(pageKey: string): Promise<{
  ready: boolean;
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
    return { ready, menu, pageKey: HOME_PAGE_KEY, draft: emptyArrangement(), note: "", published: emptyArrangement(), history: [], articles: {} };
  }
  const page = pageOf(pageKey, menu);
  const db = getDb();
  const [draftRow, publishedRow, historyRows] = await Promise.all([
    db.select().from(pageArrangements).where(and(eq(pageArrangements.pageKey, page.key), eq(pageArrangements.status, "draft"))).limit(1),
    db.select().from(pageArrangements).where(and(eq(pageArrangements.pageKey, page.key), eq(pageArrangements.status, "published"))).limit(1),
    db.select({ id: pageArrangements.id, publishedAt: pageArrangements.publishedAt, note: pageArrangements.note })
      .from(pageArrangements)
      .where(and(eq(pageArrangements.pageKey, page.key), eq(pageArrangements.status, "history")))
      .orderBy(desc(pageArrangements.createdAt))
      .limit(HISTORY_LIMIT),
  ]);
  const published = readDocument(publishedRow[0]?.document);
  const draft = draftRow[0] ? readDocument(draftRow[0].document) : published;
  const articles = await articleMap([...new Set([...referencedArticleIds(draft), ...referencedArticleIds(published)])]);
  return {
    ready,
    menu,
    pageKey: page.key,
    draft,
    note: draftRow[0]?.note ?? publishedRow[0]?.note ?? "",
    published,
    history: historyRows.map((row) => ({ id: row.id, publishedAt: row.publishedAt?.toISOString() ?? null, note: row.note })),
    articles,
  };
}

export async function saveArrangement(staff: Staff, pageKey: string, document: ArrangementDocument, note: string): Promise<void> {
  await requireReady();
  const menu = await menuCategories();
  const page = pageOf(pageKey, menu);
  const clean = sanitizeArrangement(page.key, document, page.categories);
  const db = getDb();
  const [existing] = await db.select().from(pageArrangements).where(and(eq(pageArrangements.pageKey, page.key), eq(pageArrangements.status, "draft"))).limit(1);
  const previous = existing ? readDocument(existing.document) : emptyArrangement();
  const stamped = stamp(clean, previous, staff.name);
  const trimmedNote = note.trim().slice(0, 400);
  if (existing) {
    await db.update(pageArrangements).set({ document: stamped, note: trimmedNote, placedBy: staff.id }).where(eq(pageArrangements.id, existing.id));
    return;
  }
  await db.insert(pageArrangements).values({ pageKey: page.key, status: "draft", document: stamped, note: trimmedNote, placedBy: staff.id });
}

async function revalidate(path: string) {
  if (!process.env.REVALIDATE_SECRET) return;
  try {
    await fetch(new URL("/api/revalidate/", process.env.WEB_URL || "http://localhost:3000"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": process.env.REVALIDATE_SECRET },
      body: JSON.stringify({ paths: [path] }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // The open page also refreshes from the outbox event.
  }
}

export async function publishArrangement(staff: Staff, pageKey: string): Promise<{ path: string }> {
  await requireReady();
  const menu = await menuCategories();
  const page = pageOf(pageKey, menu);
  const db = getDb();
  await db.transaction(async (tx) => {
    const [draft] = await tx.select().from(pageArrangements).where(and(eq(pageArrangements.pageKey, page.key), eq(pageArrangements.status, "draft"))).for("update").limit(1);
    if (!draft) throw new EditorError(422, "not_ready", "Първо запазете подреждането.");
    const [current] = await tx.select().from(pageArrangements).where(and(eq(pageArrangements.pageKey, page.key), eq(pageArrangements.status, "published"))).for("update").limit(1);
    if (current) await tx.update(pageArrangements).set({ status: "history" }).where(eq(pageArrangements.id, current.id));
    await tx.insert(pageArrangements).values({
      pageKey: page.key,
      status: "published",
      document: draft.document,
      note: draft.note,
      placedBy: staff.id,
      publishedAt: new Date(),
    });
    const history = await tx
      .select({ id: pageArrangements.id })
      .from(pageArrangements)
      .where(and(eq(pageArrangements.pageKey, page.key), eq(pageArrangements.status, "history")))
      .orderBy(desc(pageArrangements.createdAt));
    const extra = history.slice(HISTORY_LIMIT).map((row) => row.id);
    if (extra.length) await tx.delete(pageArrangements).where(inArray(pageArrangements.id, extra));
    await tx.insert(outboxEvents).values({
      type: "layout.updated",
      entityId: null,
      version: 1,
      payload: { path: page.path, title: page.title, topics: [] },
    });
  });
  await revalidate(page.path);
  return { path: page.path };
}

export async function revertArrangement(staff: Staff, pageKey: string, historyId: string): Promise<void> {
  await requireReady();
  const menu = await menuCategories();
  const page = pageOf(pageKey, menu);
  const db = getDb();
  await db.transaction(async (tx) => {
    const [history] = await tx.select().from(pageArrangements).where(and(eq(pageArrangements.id, historyId), eq(pageArrangements.pageKey, page.key), eq(pageArrangements.status, "history"))).limit(1);
    if (!history) throw new EditorError(404, "not_found", "Това подреждане вече го няма.");
    const [current] = await tx.select().from(pageArrangements).where(and(eq(pageArrangements.pageKey, page.key), eq(pageArrangements.status, "published"))).for("update").limit(1);
    if (current) await tx.update(pageArrangements).set({ status: "history" }).where(eq(pageArrangements.id, current.id));
    await tx.insert(pageArrangements).values({
      pageKey: page.key,
      status: "published",
      document: history.document,
      note: history.note,
      placedBy: staff.id,
      publishedAt: new Date(),
    });
    const [draft] = await tx.select().from(pageArrangements).where(and(eq(pageArrangements.pageKey, page.key), eq(pageArrangements.status, "draft"))).limit(1);
    if (draft) await tx.update(pageArrangements).set({ document: history.document, note: history.note, placedBy: staff.id }).where(eq(pageArrangements.id, draft.id));
    else await tx.insert(pageArrangements).values({ pageKey: page.key, status: "draft", document: history.document, note: history.note, placedBy: staff.id });
    await tx.insert(outboxEvents).values({
      type: "layout.updated",
      entityId: null,
      version: 1,
      payload: { path: page.path, title: page.title, topics: [] },
    });
  });
  await revalidate(page.path);
}

export async function placeArticle(staff: Staff, input: { pageKey: string; slot: string; articleId: string; hours: number | null }): Promise<void> {
  await requireReady();
  const menu = await menuCategories();
  const page = pageOf(input.pageKey, menu);
  const [article] = await getDb().select({ id: articles.id, isPublic: articles.isPublic }).from(articles).where(eq(articles.id, input.articleId)).limit(1);
  if (!article?.isPublic) throw new EditorError(422, "not_ready", "На място се слага само публикувана новина.");
  const probe = sanitizeArrangement(page.key, {
    slots: { [input.slot]: { items: [{ articleId: input.articleId, startsAt: null, endsAt: null, placedBy: "", placedAt: null }] } },
    excluded: [],
  }, page.categories);
  if (!probe.slots[input.slot]) throw new EditorError(422, "invalid_input", "Няма такова място.");
  const current = await loadArrangement(page.key);
  const endsAt = input.hours === null ? null : new Date(Date.now() + input.hours * 60 * 60 * 1000).toISOString();
  const existing = current.draft.slots[input.slot]?.items.filter((item) => item.articleId !== input.articleId) ?? [];
  const next: ArrangementDocument = {
    ...current.draft,
    slots: {
      ...current.draft.slots,
      [input.slot]: {
        items: [{ articleId: input.articleId, startsAt: null, endsAt, placedBy: staff.name, placedAt: new Date().toISOString() }, ...existing].slice(0, 6),
      },
    },
  };
  await saveArrangement(staff, page.key, next, current.note);
}

export async function searchPlacementArticles(query: string): Promise<ArrangementArticle[]> {
  const term = query.trim().slice(0, 80);
  if (term.length < 2) return [];
  return getDb()
    .select({ id: articles.id, title: articles.title, categoryName: categories.name, isPublic: articles.isPublic })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .where(and(eq(articles.isPublic, true), ilike(articles.title, `%${term.replace(/[%_]/g, "")}%`)))
    .orderBy(desc(articles.publishedAt))
    .limit(12);
}
