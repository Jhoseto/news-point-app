/**
 * Rewrite the AI brief draft with Koce's GPT-6 / Intelligent UI text + related photos.
 * Usage: pnpm --filter @newspoint/studio exec node --import tsx ../../apps/studio/scripts/rewrite-gpt6-draft.mjs
 */
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
process.chdir(root);

const { createScriptDb } = await import("@newspoint/db/node");
const { eq, desc, asc, sql } = await import("@newspoint/db/orm");
const { articles, articleRevisions, mediaAssets, mediaPresentations, staffUsers } = await import("@newspoint/db/schema");
const { articleBody } = await import("@newspoint/content");
const { remoteDiskFromEnv, writeRemoteFile } = await import("@newspoint/content/disk");
const { prepareUploadedPhotoWithVariants } = await import("../lib/uploaded-photo.ts");

const ARTICLE_ID = "d4694ce4-d5bf-49ff-836d-91b0cbd190eb";
const PREFIXES = ["news/", "users/profiles/", "users/livepoint/", "podcasts/", "ai-podcasts/"];
const UA = "NewsPointBot/1.0 (editorial media for newspoint.bg; contact via site)";

const PHOTOS = [
  {
    slot: "hero",
    alt: "Интерфейс на ChatGPT — разговор с голям езиков модел",
    credit: "Wikimedia Commons (CC BY-SA 4.0) — екранна снимка на ChatGPT",
    url: "https://upload.wikimedia.org/wikipedia/commons/0/05/ChatGPT_%28GPT4%29_a_zispleg_penaos_degas_kemmo%C3%B9_d%E2%80%99ar_Wikipedia_brezhonek.png",
  },
  {
    slot: "interactive",
    alt: "Интерактивни графики и табла с данни на лаптоп — Intelligent UI в действие",
    credit: "Luke Chesser · Unsplash",
    url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1920&q=80",
  },
  {
    slot: "workspace",
    alt: "Работа с цифрови инструменти и визуализации на екрана",
    credit: "Carlos Muza · Unsplash",
    url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1920&q=80",
  },
];

async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" }, redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8_000) throw new Error(`Suspiciously small download (${buf.length} B): ${url}`);
  return buf;
}

async function storePhoto(db, bytes, { alt, credit }) {
  const photo = await prepareUploadedPhotoWithVariants(bytes);
  const remote = remoteDiskFromEnv();
  if (!remote) throw new Error("MEDIA_SSH_* / remote disk is required.");
  const now = new Date();
  const base = randomUUID();
  const folder = `news/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const fullKey = `${folder}/${base}.webp`;
  const variantKeys = photo.variants.map((variant) => ({ ...variant, key: `${folder}/${base}-w${variant.width}.webp` }));
  await writeRemoteFile(remote, fullKey, photo.full.buffer, PREFIXES);
  for (const variant of variantKeys) {
    await writeRemoteFile(remote, variant.key, variant.buffer, PREFIXES);
  }
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      provider: "object_storage",
      storageKey: fullKey,
      mime: "image/webp",
      width: photo.full.width,
      height: photo.full.height,
      alt,
      caption: "",
      credit,
    })
    .returning({ id: mediaAssets.id });
  await db.insert(mediaPresentations).values({
    mediaAssetId: asset.id,
    variants: variantKeys.map((variant) => ({
      url: `/media/${variant.key}`,
      width: variant.width,
      height: variant.height,
    })),
  }).onConflictDoNothing();
  return asset.id;
}

/** Inner HTML only — preview/editor wrap paragraphs in <p> themselves. */
function p(html) {
  return { type: "paragraph", html };
}
function h2(text) {
  return { type: "heading", level: 2, text };
}
function image(mediaAssetId, caption) {
  return {
    type: "image",
    mediaAssetId,
    caption,
    alt: caption,
    size: "large",
    align: "center",
    frame: "soft",
    shape: "rounded",
  };
}

async function main() {
  const { db, close } = createScriptDb("dev");
  try {
    const [article] = await db.select().from(articles).where(eq(articles.id, ARTICLE_ID)).limit(1);
    if (!article) throw new Error(`Article ${ARTICLE_ID} not found`);
    if (article.isPublic) throw new Error("Article is public — refusing to mutate.");

    const [latest] = await db
      .select()
      .from(articleRevisions)
      .where(eq(articleRevisions.articleId, ARTICLE_ID))
      .orderBy(desc(articleRevisions.number))
      .limit(1);
    if (!latest) throw new Error("No revision");

    const [staff] = await db
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .orderBy(desc(staffUsers.role), asc(staffUsers.name))
      .limit(1);
    if (!staff) throw new Error("No staff user");

    const ids = {};
    for (const photo of PHOTOS) {
      process.stdout.write(`Photo ${photo.slot}… `);
      const bytes = await download(photo.url);
      process.stdout.write(`${Math.round(bytes.length / 1024)} KB → `);
      ids[photo.slot] = await storePhoto(db, bytes, photo);
      console.log(ids[photo.slot]);
    }

    const title =
      "GPT-6 променя ChatGPT: изкуственият интелект вече създава интерактивни инструменти директно в разговора";
    const excerpt =
      "OpenAI разширява достъпа до GPT-6 и представя Intelligent UI — технология, която превръща разговора с AI във визуално и интерактивно преживяване с графики, таблици и инструменти.";
    const slug = "gpt-6-chatgpt-intelligent-ui-8-oktomvri-2026";

    const body = [
      p(
        "<strong>OpenAI разширява достъпа до новото поколение GPT-6 и представя Intelligent UI, технология, която превръща обикновения разговор с изкуствен интелект във визуално и интерактивно преживяване.</strong>",
      ),
      p("OpenAI предприема нова голяма стъпка в развитието на ChatGPT. Компанията обяви глобалното разширяване на достъпа до GPT-6, като едновременно с това представи технологията Intelligent UI, която променя начина, по който потребителите получават и използват информация от изкуствения интелект."),
      p(
        "Вместо да отговаря единствено с текст, ChatGPT вече може да представя информацията чрез интерактивни графики, сравнителни таблици, визуални обяснения и инструменти, създадени специално за конкретната задача.",
      ),
      p("Промяната изглежда техническа, но последиците ѝ могат да бъдат значителни."),
      h2("От чатбот към интерактивна работна среда"),
      image(
        ids.interactive,
        "Intelligent UI позволява ChatGPT да връща не само текст, а интерактивни графики, таблици и инструменти.",
      ),
      p(
        "Досега взаимодействието с AI до голяма степен следваше познат модел: потребителят задава въпрос, а системата генерира отговор.",
      ),
      p(
        "С Intelligent UI този подход се разширява. Например при въпрос за сравнение на финансови продукти ChatGPT може да представи интерактивна таблица. При математически проблем може да създаде визуализация, а при необходимост от конкретно изчисление да предложи работещ инструмент.",
      ),
      p("По този начин потребителят не просто получава информация, а може да взаимодейства с нея."),
      h2("По-бързи отговори и нов начин на работа"),
      image(
        ids.workspace,
        "GPT-6 може да започне полезен отговор, докато продължава допълнителни изчисления или проверки.",
      ),
      p(
        "Сред съществените промени е възможността GPT-6 да започне да предоставя полезен отговор, докато продължава да извършва допълнителни изчисления или проверки.",
      ),
      p(
        "Това намалява усещането за изчакване при сложни задачи и позволява първоначалните резултати да бъдат допълвани с нова информация.",
      ),
      p(
        "Разширяването на достъпа започна на 7 октомври за платените потребители, а от 8 октомври обхваща и безплатните планове.",
      ),
      h2("Какво означава това за бъдещето?"),
      p(
        "Новото поколение ChatGPT показва тенденция, която постепенно обхваща цялата технологична индустрия: изкуственият интелект се превръща от инструмент за генериране на текст в система, която може да изгражда интерфейси, да обработва информация и да подпомага изпълнението на практически задачи.",
      ),
      p(
        "Това поставя и нови въпроси за надеждността на генерираните резултати, защитата на данните и зависимостта на потребителите от AI системите.",
      ),
      p(
        "<strong>Едно е сигурно: конкуренцията между технологичните компании вече няма да се определя единствено от качеството на отговорите, а и от това колко полезни действия може да извършва изкуственият интелект.</strong>",
      ),
    ];

    const parsed = articleBody.safeParse(body);
    if (!parsed.success) {
      console.error(parsed.error.flatten());
      throw new Error("articleBody validation failed");
    }

    const nextNumber = Number(latest.number) + 1;
    await db.transaction(async (tx) => {
      await tx
        .update(articles)
        .set({
          title,
          excerpt,
          body: parsed.data,
          heroMediaId: ids.hero,
          updatedAt: sql`now()`,
        })
        .where(eq(articles.id, ARTICLE_ID));
      await tx.insert(articleRevisions).values({
        articleId: ARTICLE_ID,
        number: nextNumber,
        title,
        slug,
        excerpt,
        body: parsed.data,
        primaryCategoryId: latest.primaryCategoryId,
        heroMediaId: ids.hero,
        heroEmbedUrl: null,
        authorKind: latest.authorKind,
        authorUserId: latest.authorUserId,
        authorName: latest.authorName,
        createdBy: staff.id,
        listenEnabled: latest.listenEnabled,
      });
    });

    console.log("\nDraft rewritten (still unpublished):");
    console.log(`  title:    ${title}`);
    console.log(`  slug:     ${slug}`);
    console.log(`  revision: ${nextNumber}`);
    console.log(`  hero:     ${ids.hero}`);
    console.log(`  studio:   http://localhost:3001/articles/${ARTICLE_ID}/`);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
