import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import { createSessionClient } from "../packages/db/src/connection";
import * as schema from "@newspoint/db/schema";
import type { ScriptDb } from "@newspoint/db/node";
import { lockArrangements, publishHomeHero } from "../packages/db/src/arrangement-writes";
import { createArticle, deleteArticle, publishRevision } from "../apps/studio/lib/articles";
import { loadArrangement, saveArrangement } from "../apps/studio/lib/arrangements";
import { publishDueScheduled } from "../packages/db/src/scheduled-publish";

// Opt-in only: bootstrap.cjs creates this dedicated local cluster. Never uses .env.local.
const holder = vi.hoisted(() => ({ db: null as ScriptDb | null }));
vi.mock("@newspoint/db", async () => ({ ...await vi.importActual<typeof import("@newspoint/db")>("@newspoint/db"), getDb: () => holder.db }));

describe.runIf(process.env.NP_HERO_REAL_PG === "1")("hero placement on actual PostgreSQL connections", () => {
  const actor = { id: "qa-editor", name: "QA Fixture editor", email: "qa-editor@example.invalid", role: "editor" as const };
  let client: ReturnType<typeof createSessionClient>;
  let db: ScriptDb;
  let categoryId: string;
  beforeAll(async () => {
    client = createSessionClient("postgres://hero_qa@127.0.0.1:55438/hero_position_qa", 8);
    db = drizzle(client, { schema }); holder.db = db;
    const [identity] = await client`select current_database() as name, inet_server_port() as port`;
    expect(identity).toMatchObject({ name: "hero_position_qa", port: 55438 });
    const [category] = await db.select().from(schema.categories).where(eq(schema.categories.slug, "plovdiv"));
    categoryId = category!.id;
  });
  beforeEach(async () => { await db.delete(schema.pageArrangements); });
  afterAll(async () => { await client?.end({ timeout: 5 }); });
  const create = (position: 1 | 2 | 3 | 4) => createArticle(actor, {
    title: "Explicit local hero QA fixture", slug: `hero-qa-${randomUUID()}`, excerpt: "Isolated fixture",
    body: [{ type: "paragraph", html: "Isolated QA only" }], primaryCategoryId: categoryId,
    heroMediaId: null, heroEmbedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    authorKind: "staff", authorUserId: actor.id, authorName: actor.name, listenEnabled: false, homeHeroPosition: position,
  });

  it("preserves simultaneous publications to different positions", async () => {
    const a = await create(1), b = await create(4);
    await Promise.all([publishRevision(actor, a.id, 1, randomUUID(), false), publishRevision(actor, b.id, 1, randomUUID(), false)]);
    const state = await loadArrangement("home");
    expect(state.published.slots.hero?.items[0]?.articleId).toBe(a.id);
    expect(state.published.slots["support-2"]?.items[0]?.articleId).toBe(b.id);
    expect(state.draft).toEqual(state.published);
  });

  it("serializes competing replacements of one slot and retains history", async () => {
    const a = await create(2), b = await create(2);
    await Promise.all([publishRevision(actor, a.id, 1, randomUUID(), false), publishRevision(actor, b.id, 1, randomUUID(), false)]);
    const state = await loadArrangement("home");
    expect([a.id, b.id]).toContain(state.published.slots["support-0"]?.items[0]?.articleId);
    expect(state.published.slots["support-0"]?.items).toHaveLength(1);
    expect(state.history).toHaveLength(1);
    expect(await db.select().from(schema.pageArrangements).where(eq(schema.pageArrangements.status, "published"))).toHaveLength(1);
  });

  it("checks stale state after waiting for the lock, not before", async () => {
    const a = await create(1); await publishRevision(actor, a.id, 1, randomUUID(), false);
    const stale = await loadArrangement("home");
    let announce!: () => void, release!: () => void;
    const locked = new Promise<void>(resolve => { announce = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const blocker = db.transaction(async tx => {
      await lockArrangements(tx); announce(); await gate;
      await publishHomeHero(tx, a.id, 3, actor.id, actor.name);
    });
    await locked;
    const saving = saveArrangement(actor, "home", stale.draft, "stale", stale.version).then(() => "unexpected save", error => error.code);
    try {
      const deadline = Date.now() + 5000;
      while (true) {
        const waiting = await client`select 1 from pg_stat_activity where datname=current_database() and wait_event='advisory'`;
        if (waiting.length) break;
        if (Date.now() > deadline) throw new Error("No competing PostgreSQL lock waiter observed");
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    } finally { release(); }
    await blocker;
    expect(await saving).toBe("arrangement_conflict");
    expect((await loadArrangement("home")).published.slots["support-1"]?.items[0]?.articleId).toBe(a.id);
  });

  it("does not resurrect a deleted story during another publication", async () => {
    const old = await create(1); await publishRevision(actor, old.id, 1, randomUUID(), false);
    const next = await create(4);
    await Promise.all([deleteArticle(actor, old.id), publishRevision(actor, next.id, 1, randomUUID(), false)]);
    const state = await loadArrangement("home");
    for (const document of [state.published, state.draft]) {
      expect(Object.values(document.slots).flatMap(slot => slot.items.map(item => item.articleId))).not.toContain(old.id);
      expect(document.slots["support-2"]?.items[0]?.articleId).toBe(next.id);
    }
  });

  it("applies a position only once when the scheduler and publish button race", async () => {
    const article = await create(2);
    await db.update(schema.articles).set({ scheduledPublishAt: sql`now()-interval '1 minute'` }).where(eq(schema.articles.id, article.id));
    await Promise.all([publishDueScheduled(db, article.id), publishRevision(actor, article.id, 1, randomUUID(), false)]);
    const state = await loadArrangement("home");
    expect(state.published.slots["support-0"]?.items[0]?.articleId).toBe(article.id);
    expect(state.history).toHaveLength(0);
    expect((await db.select().from(schema.articles).where(eq(schema.articles.id, article.id)))[0]?.isPublic).toBe(true);
  });
});
