import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@newspoint/db/schema";
import { queryArticleDesk } from "../apps/studio/lib/article-desk";
import { ARTICLE_SORTS, parseArticleListQuery } from "../apps/studio/lib/article-list-query";

const holder = vi.hoisted(() => ({ db: null as ReturnType<typeof drizzle<typeof schema>> | null }));
vi.mock("@newspoint/db", async () => ({ ...await vi.importActual<typeof import("@newspoint/db")>("@newspoint/db"), getDb: () => holder.db }));
let pg: PGlite;
const ids = Array.from({ length: 4 }, () => randomUUID());
const categoryIds = [randomUUID(), randomUUID()];
const query = (params: Record<string, string> = {}) => queryArticleDesk(parseArticleListQuery(params));

beforeAll(async () => {
  pg = new PGlite();
  const db = drizzle(pg, { schema }); holder.db = db;
  const execute = db.execute.bind(db);
  db.execute = ((...args: Parameters<typeof execute>) => execute(...args).then(result => result.rows)) as typeof db.execute;
  const included = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 17, 18, 19, 20, 21, 24, 25, 26, 27, 30, 38]);
  for (const file of readdirSync("packages/db/migrations").sort()) if (included.has(Number(file.slice(0, 2)))) await pg.exec(readFileSync(`packages/db/migrations/${file}`, "utf8"));
  await db.insert(schema.categories).values(categoryIds.map((id, index) => ({ id, slug: `qa-${index}`, path: `/qa-${index}/`, name: index ? "B" : "A", kind: "section" as const })));
  await db.insert(schema.articles).values(ids.map((id, i) => ({
    id, sourceSystem: "studio" as const, slug: `qa-${i}`, path: `/qa-${i}/`, title: `QA ${i}`,
    authorName: `QA ${3 - i}`, authorKind: "manual" as const, primaryCategoryId: categoryIds[i % 2], isPublic: i < 2,
    publishedAt: i < 2 ? new Date(`2026-10-${10 + i}T09:00:00Z`) : null,
    publishedRevision: i < 2 ? 1 : null,
    scheduledPublishAt: i === 2 ? new Date("2026-11-01T09:00:00Z") : null,
    updatedAt: new Date(`2026-10-${10 + i}T09:00:00Z`),
  })));
  await db.insert(schema.articleRevisions).values({ articleId: ids[1], number: 2, title: "QA changed", slug: "qa-1", body: [], authorName: "QA 2", authorKind: "manual" });
  await db.insert(schema.articleReadCounts).values([{ articleId: ids[0], readCount: 10 }, { articleId: ids[1], readCount: 2 }]);
  await db.insert(schema.articleViewBoosts).values({ articleId: ids[1], artificialCount: 20 });
}, 30000);
afterAll(async () => { await pg?.close(); });

it("counts and filters drafts, scheduled and unpublished edits separately", async () => {
  const all = await query();
  expect(all).toMatchObject({ total: 4, matched: 4, published: 2, drafts: 1, scheduled: 1, changed: 1, shown: 4 });
  for (const [status, expected] of [["draft", ids[3]], ["scheduled", ids[2]], ["changed", ids[1]]] as const) {
    const desk = await query({ status });
    expect(desk.items.map(item => item.id)).toEqual([expected]);
    expect(desk.shown).toBe(1);
  }
  expect((await query({ status: "scheduled" })).items[0].scheduledPublishAt?.toISOString()).toBe("2026-11-01T09:00:00.000Z");
});

it("combines search, rubric, author and inclusive Sofia change dates", async () => {
  const desk = await query({ q: "QA", category: categoryIds[0], from: "2026-10-12", to: "2026-10-12", status: "scheduled" });
  expect(desk.items.map(item => item.id)).toEqual([ids[2]]);
  expect(desk.matched).toBe(1);
  expect((await query({ q: "QA 1", author: "newsroom" })).shown).toBe(0);
  expect((await query({ q: "QA%" })).shown).toBe(0);
});

for (const sort of ARTICLE_SORTS) it(`sorts ${sort} over the result set in both directions`, async () => {
  const asc = await query({ sort, dir: "asc" });
  const desc = await query({ sort, dir: "desc" });
  if (sort === "published") {
    expect(asc.items.slice(0, 2).map(item => item.id)).toEqual([ids[0], ids[1]]);
    expect(desc.items.slice(0, 2).map(item => item.id)).toEqual([ids[1], ids[0]]);
    expect(desc.items.slice(2).every(item => item.publishedAt === null)).toBe(true);
  } else {
    expect(desc.items.map(item => item.id)).toEqual(asc.items.map(item => item.id).reverse());
  }
  if (sort === "views") expect(desc.items[0].id).toBe(ids[1]); // real + editorial views
  if (sort === "category") expect(asc.items.map(item => item.categoryName)).toEqual(["A", "A", "B", "B"]);
  if (sort === "status") expect(asc.items.map(item => item.id)).toEqual([ids[2], ids[0], ids[1], ids[3]]);
  if (sort === "title" || sort === "updated") expect(asc.items.map(item => item.id)).toEqual(ids);
  if (sort === "author") expect(asc.items.map(item => item.id)).toEqual([...ids].reverse());
});

it("clamps a stale page after filtering and keeps an empty result valid", async () => {
  expect(await query({ status: "scheduled", page: "99" })).toMatchObject({ page: 1, pageCount: 1, shown: 1 });
  expect(await query({ q: "QA no match", page: "99" })).toMatchObject({ page: 1, pageCount: 1, shown: 0, items: [] });
});
