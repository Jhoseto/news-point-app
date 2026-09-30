import "server-only";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "./index";
import { categories, podcasts } from "./schema";

export class PodcastError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const readiness = { until: 0, pending: null as Promise<boolean> | null };

export function podcastsReady(): Promise<boolean> {
  if (readiness.pending && readiness.until > Date.now()) return readiness.pending;
  const pending = getDb().execute<{ ready: boolean }>(sql`select to_regclass('public.podcasts') is not null as ready`)
    .then((rows) => rows[0]?.ready === true)
    .catch(() => false);
  readiness.pending = pending;
  readiness.until = Date.now() + 30_000;
  pending.catch(() => { readiness.pending = null; });
  return pending;
}

const columns = {
  id: podcasts.id,
  title: podcasts.title,
  slug: podcasts.slug,
  summary: podcasts.summary,
  coverKey: podcasts.coverKey,
  audioKey: podcasts.audioKey,
  durationSec: podcasts.durationSec,
  bytes: podcasts.bytes,
  categoryId: podcasts.categoryId,
  categoryName: categories.name,
  status: podcasts.status,
  publishedAt: podcasts.publishedAt,
  createdAt: podcasts.createdAt,
};

function listed() {
  return getDb().select(columns).from(podcasts).leftJoin(categories, eq(categories.id, podcasts.categoryId));
}

export async function listPublishedPodcasts() {
  return listed().where(eq(podcasts.status, "published")).orderBy(desc(podcasts.publishedAt));
}

export async function publishedPodcastBySlug(slug: string) {
  const [row] = await listed().where(eq(podcasts.slug, slug)).limit(1);
  return row?.status === "published" ? row : null;
}

export async function publishedPodcastAudio(id: string) {
  const [row] = await getDb().select({
    id: podcasts.id,
    slug: podcasts.slug,
    title: podcasts.title,
    audioKey: podcasts.audioKey,
    status: podcasts.status,
  }).from(podcasts).where(eq(podcasts.id, id)).limit(1);
  return row?.status === "published" ? row : null;
}

export async function listPodcastCategories(slugs: string[]) {
  if (!slugs.length) return [];
  return getDb().select({ id: categories.id, slug: categories.slug, name: categories.name }).from(categories).where(inArray(categories.slug, slugs)).orderBy(asc(categories.name));
}

export async function listStudioPodcasts() {
  return listed().orderBy(desc(podcasts.createdAt));
}

export async function insertPodcast(input: {
  title: string;
  slug: string;
  summary: string;
  coverKey: string;
  audioKey: string;
  durationSec: number;
  bytes: number;
  categoryId: string | null;
  status: "draft" | "published";
  createdBy: string;
}) {
  const publishedAt = input.status === "published" ? new Date() : null;
  const [row] = await getDb().insert(podcasts).values({ ...input, publishedAt }).returning({ id: podcasts.id, slug: podcasts.slug });
  return row!;
}

export async function updatePodcastCopy(id: string, input: { title: string; summary: string; categoryId: string | null }) {
  const [row] = await getDb().update(podcasts).set({ ...input, updatedAt: new Date() }).where(eq(podcasts.id, id)).returning({ id: podcasts.id, slug: podcasts.slug, status: podcasts.status });
  return row ?? null;
}

export async function setPodcastStatus(id: string, status: "draft" | "published") {
  const [current] = await getDb().select({ publishedAt: podcasts.publishedAt }).from(podcasts).where(eq(podcasts.id, id)).limit(1);
  if (!current) return null;
  const publishedAt = status === "published" ? current.publishedAt ?? new Date() : current.publishedAt;
  const [row] = await getDb().update(podcasts).set({ status, publishedAt, updatedAt: new Date() }).where(eq(podcasts.id, id)).returning({
    id: podcasts.id,
    slug: podcasts.slug,
    status: podcasts.status,
  });
  return row ?? null;
}
