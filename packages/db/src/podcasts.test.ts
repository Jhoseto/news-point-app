import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { expect, it, vi } from "vitest";
import { listPublishedPodcastLinks, listPublishedPodcasts, publishedPodcastBySlug } from "./podcasts";

const getDb = vi.hoisted(() => vi.fn());
vi.mock("./index", () => ({ getDb }));

it("shows historical and newly published episodes on all discovery surfaces and removes withdrawn episodes", async () => {
  const engine = new PGlite();
  try {
    getDb.mockReturnValue(drizzle(engine));
    await engine.exec("create table categories(id uuid primary key, name text); create table staff_users(id text primary key)");
    await engine.exec(await readFile("packages/db/migrations/22_podcasts.sql", "utf8"));
    await engine.exec(`alter table podcasts add column revision integer not null default 1;
      insert into podcasts (slug, title, summary, cover_key, audio_key, duration_sec, bytes, status, published_at)
      select slug, slug, 'Fixture summary', 'podcasts/2026/10/ab.webp', 'podcasts/2026/10/ab.mp3', 60, 1, status, stamp
      from (values ('old-fixture', 'published', now() - interval '1 year'), ('new-fixture', 'published', now()),
        ('draft-fixture', 'draft', null), ('future-fixture', 'published', now() + interval '1 day')) f(slug, status, stamp)`);
    const slugs = (rows: { slug: string }[]) => rows.map(row => row.slug);
    expect(slugs(await listPublishedPodcastLinks())).toEqual(["new-fixture", "old-fixture"]);
    expect(slugs(await listPublishedPodcasts())).toEqual(["new-fixture", "old-fixture"]);
    expect(slugs(await listPublishedPodcastLinks(1))).toEqual(["new-fixture"]);
    expect(await publishedPodcastBySlug("future-fixture")).toBeNull();
    expect(await publishedPodcastBySlug("draft-fixture")).toBeNull();
    await engine.exec("update podcasts set status = 'published', published_at = now() where slug = 'draft-fixture'");
    expect(slugs(await listPublishedPodcastLinks(1))).toEqual(["draft-fixture"]);
    await engine.exec("update podcasts set status = 'draft'");
    expect(await listPublishedPodcastLinks()).toEqual([]);
    expect(await publishedPodcastBySlug("old-fixture")).toBeNull();
  } finally { await engine.close(); }
}, 30_000);
