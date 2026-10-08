/**
 * Strip outer <p> wrappers from paragraph/quote html (TipTap stores inner HTML only).
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
process.chdir(root);

const { createScriptDb } = await import("@newspoint/db/node");
const { eq, desc, asc, sql } = await import("@newspoint/db/orm");
const { articles, articleRevisions, staffUsers } = await import("@newspoint/db/schema");
const { articleBody } = await import("@newspoint/content");

const ARTICLE_ID = "d4694ce4-d5bf-49ff-836d-91b0cbd190eb";

function unwrapP(html) {
  const m = String(html).trim().match(/^<p(?:\s[^>]*)?>([\s\S]*)<\/p>$/i);
  return m ? m[1] : html;
}

const { db, close } = createScriptDb("dev");
try {
  const [article] = await db.select().from(articles).where(eq(articles.id, ARTICLE_ID)).limit(1);
  if (!article) throw new Error("missing article");
  if (article.isPublic) throw new Error("public — refusing");

  const [latest] = await db
    .select()
    .from(articleRevisions)
    .where(eq(articleRevisions.articleId, ARTICLE_ID))
    .orderBy(desc(articleRevisions.number))
    .limit(1);

  const [staff] = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .orderBy(desc(staffUsers.role), asc(staffUsers.name))
    .limit(1);

  const fixed = latest.body.map((block) => {
    if (block.type === "paragraph" || block.type === "quote") {
      return { ...block, html: unwrapP(block.html) };
    }
    return block;
  });
  const parsed = articleBody.parse(fixed);
  const next = Number(latest.number) + 1;

  await db.transaction(async (tx) => {
    await tx.update(articles).set({ body: parsed, updatedAt: sql`now()` }).where(eq(articles.id, ARTICLE_ID));
    await tx.insert(articleRevisions).values({
      articleId: ARTICLE_ID,
      number: next,
      title: latest.title,
      slug: latest.slug,
      excerpt: latest.excerpt,
      body: parsed,
      primaryCategoryId: latest.primaryCategoryId,
      heroMediaId: latest.heroMediaId,
      heroEmbedUrl: latest.heroEmbedUrl,
      authorKind: latest.authorKind,
      authorUserId: latest.authorUserId,
      authorName: latest.authorName,
      createdBy: staff.id,
      listenEnabled: latest.listenEnabled,
    });
  });

  console.log(
    JSON.stringify(
      {
        revision: next,
        sample: parsed.filter((b) => b.type === "paragraph").slice(0, 2).map((b) => b.html.slice(0, 100)),
      },
      null,
      2,
    ),
  );
} finally {
  await close();
}
