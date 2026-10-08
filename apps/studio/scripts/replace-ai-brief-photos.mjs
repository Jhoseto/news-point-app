/**
 * Replace editorial SVG cards on the AI brief draft with real CC photos.
 * Usage: node apps/studio/scripts/replace-ai-brief-photos.mjs
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
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

/** Curated Wikimedia Commons (or Unsplash) photos — thematic, licensed for editorial use. */
const PHOTOS = [
  {
    slot: "hero",
    alt: "Изложба за изкуствен интелект и роботика",
    credit: "Sergei Magel / Heinz Nixdorf MuseumsForum · Wikimedia Commons (CC BY-SA 4.0)",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Artificial_Intelligence_%28AI%29_and_Robotics_exhibition_at_the_Heinz_Nixdorf_MuseumsForum.jpg/1920px-Artificial_Intelligence_%28AI%29_and_Robotics_exhibition_at_the_Heinz_Nixdorf_MuseumsForum.jpg",
  },
  {
    slot: "openai",
    alt: "Човек работи на лаптоп — визуален AI чат и интерактивни отговори",
    credit: "Nenad Stojkovic · Wikimedia Commons (CC BY 2.0)",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Lonely_woman_with_curly_hair_sitting_in_an_armchair_and_working_on_a_laptop_at_home._%2851536554568%29.jpg/1920px-Lonely_woman_with_curly_hair_sitting_in_an_armchair_and_working_on_a_laptop_at_home._%2851536554568%29.jpg",
  },
  {
    slot: "anthropic",
    alt: "Техник с лаптоп пред сървърни шкафове в дата център",
    credit: "Derrick Coetzee · Wikimedia Commons (CC0)",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Technician_with_laptop_working_on_server_rack_at_NERSC.jpg/1920px-Technician_with_laptop_working_on_server_rack_at_NERSC.jpg",
  },
  {
    slot: "math",
    alt: "Математически формули и доказателства на дъска",
    credit: "Roman Mager · Unsplash",
    url: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=1920&q=80",
  },
  {
    slot: "microsoft",
    alt: "Лаптопи Microsoft Surface и Dell XPS на бюро",
    credit: "Tom Page · Wikimedia Commons (CC BY-SA 2.0)",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Dell_XPS_15_and_Microsoft_Surface_Pro_-_2020.jpg/1920px-Dell_XPS_15_and_Microsoft_Surface_Pro_-_2020.jpg",
  },
  {
    slot: "synthid",
    alt: "Биометрично сканиране на пръстов отпечатък — метафора за цифров воден знак",
    credit: "Biswarup Ganguly · Wikimedia Commons (CC BY 3.0)",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Fingerprint_Scan_-_Biometric_Data_Collection_-_Aadhaar_-_Kolkata_2015-03-18_3660.JPG/1920px-Fingerprint_Scan_-_Biometric_Data_Collection_-_Aadhaar_-_Kolkata_2015-03-18_3660.JPG",
  },
];

async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" }, redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10_000) throw new Error(`Suspiciously small download (${buf.length} B): ${url}`);
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
  const variants = variantKeys.map((variant) => ({
    url: `/media/${variant.key}`,
    width: variant.width,
    height: variant.height,
  }));
  await db.insert(mediaPresentations).values({ mediaAssetId: asset.id, variants }).onConflictDoNothing();
  return asset.id;
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
    if (!latest) throw new Error("No revision found");

    const [staff] = await db
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .orderBy(desc(staffUsers.role), asc(staffUsers.name))
      .limit(1);
    if (!staff) throw new Error("No staff user");

    const ids = {};
    for (const photo of PHOTOS) {
      process.stdout.write(`Downloading ${photo.slot}… `);
      const bytes = await download(photo.url);
      process.stdout.write(`storing (${Math.round(bytes.length / 1024)} KB)… `);
      ids[photo.slot] = await storePhoto(db, bytes, photo);
      console.log(ids[photo.slot]);
    }

    const body = structuredClone(latest.body);
    const map = [
      { match: /Intelligent UI|GPT-6 Sol/, id: ids.openai },
      { match: /Haiku|субагент/, id: ids.anthropic },
      { match: /математическ|доказателство/, id: ids.math },
      { match: /Hybrid Intelligence|локални файлове/, id: ids.microsoft },
      { match: /SynthID|воден знак/, id: ids.synthid },
    ];
    let replaced = 0;
    for (const block of body) {
      if (block.type !== "image") continue;
      const hay = `${block.caption ?? ""} ${block.alt ?? ""}`;
      const hit = map.find((m) => m.match.test(hay));
      if (hit) {
        block.mediaAssetId = hit.id;
        replaced += 1;
      }
    }
    if (replaced < 5) {
      console.warn(`Only replaced ${replaced}/5 inline images — check caption matching.`);
    }

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
          body: parsed.data,
          heroMediaId: ids.hero,
          updatedAt: sql`now()`,
        })
        .where(eq(articles.id, ARTICLE_ID));
      await tx.insert(articleRevisions).values({
        articleId: ARTICLE_ID,
        number: nextNumber,
        title: latest.title,
        slug: latest.slug,
        excerpt: latest.excerpt,
        body: parsed.data,
        primaryCategoryId: latest.primaryCategoryId,
        heroMediaId: ids.hero,
        heroEmbedUrl: latest.heroEmbedUrl,
        authorKind: latest.authorKind,
        authorUserId: latest.authorUserId,
        authorName: latest.authorName,
        createdBy: staff.id,
        listenEnabled: latest.listenEnabled,
      });
    });

    console.log("\nPhotos replaced (draft still unpublished):");
    console.log(`  hero:       ${ids.hero}`);
    console.log(`  openai:     ${ids.openai}`);
    console.log(`  anthropic:  ${ids.anthropic}`);
    console.log(`  math:       ${ids.math}`);
    console.log(`  microsoft:  ${ids.microsoft}`);
    console.log(`  synthid:    ${ids.synthid}`);
    console.log(`  revision:   ${nextNumber}`);
    console.log(`  studio:     http://localhost:3001/articles/${ARTICLE_ID}/`);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
