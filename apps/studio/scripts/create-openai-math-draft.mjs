/**
 * Unpublished Studio draft: OpenAI math retraction story (Koce's text).
 * Usage: pnpm --filter @newspoint/studio exec node --import tsx ../../apps/studio/scripts/create-openai-math-draft.mjs
 */
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
process.chdir(root);

const { createScriptDb } = await import("@newspoint/db/node");
const { eq, desc, asc } = await import("@newspoint/db/orm");
const {
  articles,
  articleRevisions,
  categories,
  mediaAssets,
  mediaPresentations,
  staffUsers,
} = await import("@newspoint/db/schema");
const { articleBody } = await import("@newspoint/content");
const { remoteDiskFromEnv, writeRemoteFile } = await import("@newspoint/content/disk");
const { prepareUploadedPhotoWithVariants } = await import("../lib/uploaded-photo.ts");

const PREFIXES = ["news/", "users/profiles/", "users/livepoint/", "podcasts/", "ai-podcasts/"];
const UA = "NewsPointBot/1.0 (editorial media for newspoint.bg; contact via site)";

const PHOTOS = [
  {
    slot: "hero",
    alt: "Математически формули на дъска — AI и фундаментална математика",
    credit: "Roman Mager · Unsplash",
    url: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=1920&q=80",
  },
  {
    slot: "error",
    alt: "Научни ръкописи и бележки — проверка на математически доказателства",
    credit: "Debby Hudson · Unsplash",
    url: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1920&q=80",
  },
  {
    slot: "future",
    alt: "Изследователска работа с данни и модели — потенциал и граници на AI в науката",
    credit: "Derrick Coetzee · Wikimedia Commons (CC0)",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Technician_with_laptop_working_on_server_rack_at_NERSC.jpg/1920px-Technician_with_laptop_working_on_server_rack_at_NERSC.jpg",
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
    const [staff] = await db
      .select({ id: staffUsers.id, name: staffUsers.name, role: staffUsers.role })
      .from(staffUsers)
      .orderBy(desc(staffUsers.role), asc(staffUsers.name))
      .limit(1);
    if (!staff) throw new Error("No staff user found.");

    const [category] = await db
      .select({ id: categories.id, name: categories.name, slug: categories.slug })
      .from(categories)
      .where(eq(categories.slug, "tehnologii"))
      .limit(1);
    if (!category) throw new Error("Category tehnologii not found.");

    console.log(`Staff: ${staff.name} (${staff.role})`);
    console.log(`Category: ${category.name}`);

    const ids = {};
    for (const photo of PHOTOS) {
      process.stdout.write(`Photo ${photo.slot}… `);
      const bytes = await download(photo.url);
      process.stdout.write(`${Math.round(bytes.length / 1024)} KB → `);
      ids[photo.slot] = await storePhoto(db, bytes, photo);
      console.log(ids[photo.slot]);
    }

    const title =
      "AI навлезе в най-сложната математика, но OpenAI оттегли три разработки след открита грешка";
    const excerpt =
      "Компанията представи резултати по стотици математически проблеми, докато последвали проверки наложиха оттегляне на три ръкописа и корекции в още 14. Случаят поставя въпроса доколко може да се разчита на AI в науката.";
    const slug = "openai-ai-matematika-otteglyane-tri-rakopisa-8-oktomvri-2026";

    const body = [
      p(`<strong>${excerpt}</strong>`),
      p(
        "Изкуственият интелект все по-активно навлиза в област, която доскоро се смяташе за една от най-трудните за автоматизиране: фундаменталната математика.",
      ),
      p(
        "OpenAI представи резултати от работата на експериментален AI модел по повече от 300 отворени математически проблема, като предизвика значителен интерес сред изследователите.",
      ),
      p(
        "Но само дни след публикуването на част от материалите компанията беше принудена да оттегли три научни ръкописа заради открита грешка в доказателство.",
      ),
      p("Още 14 разработки претърпяха различни корекции."),
      p("Случаят едновременно демонстрира потенциала на изкуствения интелект и границите на неговата надеждност."),
      h2("Каква грешка беше открита?"),
      image(
        ids.error,
        "Грешка в знак в основополагащо доказателство е довела до оттегляне на три ръкописа.",
      ),
      p(
        "Според публикуваната от OpenAI история на промените проблемът е възникнал в доказателство, свързано с алгебричността на определени математически класове.",
      ),
      p(
        "Грешка в знака е обезсилила съществена част от аргумента, върху който са били изградени и две други разработки.",
      ),
      p(
        "Така един проблем в основополагащо доказателство е довел до необходимостта от оттегляне на общо три ръкописа.",
      ),
      p(
        "При останалите 14 документа са направени поправки в доказателства, твърдения, условия и препратки.",
      ),
      h2("Може ли AI да открива нова математика?"),
      p(
        "През последните години AI системите постигат все по-сериозни резултати в задачи, изискващи логическо мислене и математически анализ.",
      ),
      p(
        "Потенциалът им не се ограничава до решаването на учебни задачи. Изследователите се интересуват от възможността алгоритмите да предлагат нови доказателства, да намират закономерности и да подпомагат разработването на научни хипотези.",
      ),
      p(
        "Въпреки това математическото откритие не се счита за окончателно потвърдено само защото модел е генерирал убедително изглеждащо доказателство.",
      ),
      p(
        "Необходима е проверка на всяка логическа стъпка, независимо от произхода на решението.",
      ),
      h2("Научен пробив или предупреждение?"),
      image(
        ids.future,
        "AI може да ускори математическите изследвания, но не замества формалната и експертна проверка.",
      ),
      p(
        "Публикуването на голям брой AI подпомогнати математически разработки създава и ново предизвикателство за научната общност.",
      ),
      p(
        "Ако алгоритмите започнат да генерират резултати по-бързо, отколкото специалистите могат да ги проверяват, ще възникне необходимост от нови инструменти и методи за оценка.",
      ),
      p(
        "Формалната проверка на доказателства чрез специализирани системи може да бъде част от решението, но не отменя въпросите за правилната формулировка, оригиналността и научната стойност на резултатите.",
      ),
      p(
        "<strong>Случаят с OpenAI показва, че изкуственият интелект може да се превърне във важен инструмент за математически изследвания, но авторитетът на една технология не може да замести доказателството.</strong>",
      ),
    ];

    const parsed = articleBody.safeParse(body);
    if (!parsed.success) {
      console.error(parsed.error.flatten());
      throw new Error("articleBody validation failed");
    }

    const articleId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(articles).values({
        id: articleId,
        sourceSystem: "studio",
        slug: articleId,
        path: `/draft/${articleId}/`,
        title,
        excerpt,
        body: parsed.data,
        primaryCategoryId: category.id,
        heroMediaId: ids.hero,
        heroEmbedUrl: null,
        authorKind: "newsroom",
        authorUserId: null,
        authorName: "NewsPoint.bg",
        isPublic: false,
        scheduledPublishAt: null,
        createdBy: staff.id,
      });
      await tx.insert(articleRevisions).values({
        articleId,
        number: 1,
        title,
        slug,
        excerpt,
        body: parsed.data,
        primaryCategoryId: category.id,
        heroMediaId: ids.hero,
        heroEmbedUrl: null,
        authorKind: "newsroom",
        authorUserId: null,
        authorName: "NewsPoint.bg",
        createdBy: staff.id,
        listenEnabled: true,
      });
    });

    console.log("\nDraft created (NOT published):");
    console.log(`  id:       ${articleId}`);
    console.log(`  slug:     ${slug}`);
    console.log(`  studio:   http://localhost:3001/articles/${articleId}/`);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
