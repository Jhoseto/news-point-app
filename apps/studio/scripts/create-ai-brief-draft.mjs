/**
 * One-off: create an unpublished Studio draft from the 8 Oct 2026 AI brief.
 * Usage: node apps/studio/scripts/create-ai-brief-draft.mjs
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Resolve workspace packages the same way Studio scripts do.
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

function xml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

async function editorialCard({ kicker, title, color, subtitle }) {
  const lines = [];
  let row = "";
  for (const word of title.trim().split(/\s+/)) {
    const next = row ? `${row} ${word}` : word;
    if (next.length > 28 && row) {
      lines.push(row);
      row = word;
      if (lines.length === 4) break;
    } else row = next;
  }
  if (row && lines.length < 4) lines.push(row);
  const titleSvg = lines.map((line, index) => `<tspan x="72" dy="${index === 0 ? 0 : 54}">${xml(line)}</tspan>`).join("");
  const svg = `<svg width="1600" height="900" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#070b22"/>
        <stop offset="1" stop-color="${xml(color)}"/>
      </linearGradient>
      <radialGradient id="glow" cx="80%" cy="10%" r="50%">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#bg)"/>
    <rect width="1600" height="900" fill="url(#glow)"/>
    <circle cx="1380" cy="180" r="220" fill="#ffffff" opacity="0.06"/>
    <rect x="72" y="110" width="96" height="10" rx="5" fill="#8ec5ff"/>
    <text x="72" y="170" fill="#9ec8ff" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="3">${xml(kicker)}</text>
    <text x="72" y="320" fill="#ffffff" font-family="Arial, sans-serif" font-size="56" font-weight="800">${titleSvg}</text>
    <text x="72" y="780" fill="#d7e6ff" font-family="Arial, sans-serif" font-size="28" font-weight="600">${xml(subtitle)}</text>
    <text x="72" y="840" fill="#ffffff" font-family="Arial, sans-serif" font-size="26" font-weight="700" opacity="0.9">NewsPoint.bg</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function storePhoto(db, bytes, alt) {
  const photo = await prepareUploadedPhotoWithVariants(bytes);
  const remote = remoteDiskFromEnv();
  if (!remote) throw new Error("MEDIA_SSH_* / remote disk is required to store news media from the laptop.");
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
      credit: "NewsPoint editorial illustration",
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

/** Inner HTML only — preview/editor wrap paragraphs in <p> themselves. */
function p(html) {
  return { type: "paragraph", html };
}
function h2(text) {
  return { type: "heading", level: 2, text };
}
function h3(text) {
  return { type: "heading", level: 3, text };
}
function quote(html, cite) {
  return { type: "quote", html, cite };
}
function list(items, ordered = false) {
  return { type: "list", ordered, items };
}
function image(mediaAssetId, caption, extras = {}) {
  return {
    type: "image",
    mediaAssetId,
    caption,
    alt: caption,
    size: "large",
    align: "center",
    frame: "soft",
    shape: "rounded",
    ...extras,
  };
}
function divider() {
  return { type: "divider" };
}

async function main() {
  const { db, close } = createScriptDb("dev");
  try {
    const [staff] = await db
      .select({ id: staffUsers.id, name: staffUsers.name, email: staffUsers.email, role: staffUsers.role })
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

    const cards = [
      {
        alt: "AI брифинг: GPT-6 и дневният ред в изкуствения интелект",
        kicker: "AI BRIEF · 8 ОКТОМВРИ 2026",
        title: "GPT-6 влиза в безплатния ChatGPT",
        color: "#3d5bdb",
        subtitle: "Плюс Anthropic, Microsoft, Biohub и още шест истории",
      },
      {
        alt: "OpenAI и новия визуален интерфейс Intelligent UI",
        kicker: "OPENAI",
        title: "Intelligent UI: отговори с графики и бутони",
        color: "#0f766e",
        subtitle: "Sol и Luna вече са в ChatGPT",
      },
      {
        alt: "Anthropic Claude Haiku 5.5 с по-ниска цена",
        kicker: "ANTHROPIC",
        title: "Haiku 5.5 — около 75% по-евтин",
        color: "#b45309",
        subtitle: "Бърз модел за агенти и обобщения",
      },
      {
        alt: "OpenAI оттегля математически статии заради грешка в знак",
        kicker: "RESEARCH",
        title: "Три математически статии са оттеглени",
        color: "#7c3aed",
        subtitle: "Знакова грешка в доказателства с нов модел",
      },
      {
        alt: "Microsoft Copilot и агенти в Windows",
        kicker: "MICROSOFT",
        title: "Copilot работи с файловете на компютъра",
        color: "#1d4ed8",
        subtitle: "Hybrid Intelligence и sandbox за агенти",
      },
      {
        alt: "Google SynthID проверка на водни знаци",
        kicker: "GOOGLE",
        title: "SynthID вече е публичен checker",
        color: "#be123c",
        subtitle: "Разпознава и водни знаци на партньори",
      },
    ];

    const mediaIds = [];
    for (const card of cards) {
      process.stdout.write(`Rendering media: ${card.kicker}… `);
      const png = await editorialCard(card);
      const id = await storePhoto(db, png, card.alt);
      mediaIds.push(id);
      console.log(id);
    }

    const [hero, imgOpenai, imgAnthropic, imgMath, imgMs, imgSynth] = mediaIds;

    const body = [
      p(
        "В рамките на ден OpenAI пусна <strong>GPT-6</strong> за безплатните потребители на ChatGPT с далеч по-визуален интерфейс, а почти едновременно оттегли три новопубликувани математически статии заради грешка в знак. Anthropic отговори с цена: малкият модел <strong>Claude Haiku 5.5</strong> струва около три четвърти по-малко от предшественика си.",
      ),
      p(
        "Към тях се добавят резултати за AI в правната професия, нов Copilot в Windows, голяма инвестиция в „виртуална клетка“, публичен checker за водни знаци и първата американска присъда за измама със стрийминг чрез AI музика. Обобщението следва дневния брифинг на <a href=\"https://aiproplaybook.com/top-ai-stories/2026-10-08\" target=\"_blank\" rel=\"noopener noreferrer\">AI Pro Playbook от 8 октомври 2026 г.</a>",
      ),
      list(
        [
          "GPT-6 Sol и Luna в ChatGPT с Intelligent UI",
          "Claude Haiku 5.5 — около 75% по-евтин за работа",
          "OpenAI оттегля три математически статии",
          "Старшите юристи печелят от AI, младшите — не еднозначно",
          "Copilot в Windows с достъп до локални файлове",
          "300 млн. долара към Biohub за виртуална клетка",
          "Публичен SynthID checker",
          "18 месеца затвор за AI стрийминг измама",
        ],
        true,
      ),
      h2("OpenAI: GPT-6 вече е в безплатния ChatGPT"),
      image(imgOpenai, "GPT-6 Sol и Luna влизат в чата с визуални отговори — Intelligent UI."),
      p(
        "Моделите <strong>GPT-6 Sol</strong> и <strong>GPT-6 Luna</strong>, пуснати в API на 22 септември, вече са достъпни и в ChatGPT. Абонатите Plus, Pro, Business и Enterprise получават Sol от 7 октомври, а от 8 октомври безплатните и Go потребители преминават от GPT-5.6 Luna към <strong>GPT-6 Luna</strong> в чата.",
      ),
      p(
        "Заедно с тях идва функцията <em>Intelligent UI</em>: моделът сам решава кога отговорът да включи интерактивна диаграма, графика, формуляр или калкулатор вътре в репликата. Визуалите могат да се намалят, ако потребителят предпочита чист текст. OpenAI твърди и по-добро уеб търсене, както и по-силна устойчивост срещу опити за заобикаляне на предпазните ограничения.",
      ),
      quote(
        "„Моделът решава кога отговорът трябва да включи интерактивна диаграма, графика, формуляр или калкулатор — и го изгражда вътре в репликата.“",
        "AI Pro Playbook / OpenAI Intelligent UI",
      ),
      h2("Anthropic: Haiku 5.5 на около една четвърт от старата цена"),
      image(imgAnthropic, "Claude Haiku 5.5 е насочен към бързи субагенти, а не към тежко кодиране."),
      p(
        "На 7 октомври Anthropic пусна <strong>Claude Haiku 5.5</strong> — малкия модел, обещан в края на септември. За подсказки до 100 000 токена цената е <strong>10 цента</strong> за милион входни токена и <strong>50 цента</strong> за милион изходни, срещу 1 и 5 долара при Haiku 4.5. Компанията говори за средна икономия около <strong>75%</strong>.",
      ),
      p(
        "Това е първият Haiku с регулируемо усилие (effort). Anthropic го позиционира като бърз субагент за резюмета, уплътняване на контекст и браузърна употреба, а не като основен инструмент за сложен програмен труд. В същия ден кеш-четенето на Sonnet 5.5 е намалено наполовина, а за Max и Team абонати са обявени месечни API кредити.",
      ),
      h2("Математика под натиск: три статии са оттеглени"),
      image(imgMath, "Знакова грешка в доказателство обърна част от новата математическа вълна на OpenAI."),
      p(
        "Ден след като OpenAI публикува <strong>722 математически статии</strong>, създадени с все още необявен модел, компанията оттегли три от тях. Грешка в знак в труд за Weil класове счупи аргумент, от който зависеха още две статии — включително твърдение за рационалната хипотеза на Ходж за произведения на K3 повърхнини.",
      ),
      p(
        "Поправени са доказателства в още 14 статии. Около <strong>42%</strong> от останалите резултати (300 от 719) вече имат машинно проверени Lean доказателства. Останалите разчитат на писмени аргументи — точно там една знакова грешка може да се скрие.",
      ),
      h3("Какво показва случаят"),
      list([
        "Скоростта на AI публикациите изисква по-строга формална проверка",
        "Lean и сходни системи намаляват, но не премахват риска при текстови доказателства",
        "Редакционният контрол остава задължителен преди „готовия“ резултат",
      ]),
      divider(),
      h2("Право: AI помага на опитните, не автоматично на начинаещите"),
      p(
        "В тримесечен рандомизиран опит в единадесет адвокатски кантори икономистът Дейвид Аутор и изследователи от Google дадоха на 133 патентни юристи AI асистент за чернови — или го задържаха. С инструмента черновите се подобриха за всички. Решаващият тест дойде на 90-ия ден: всеки юрист трябваше да поправи дефектен патент <strong>без AI</strong>.",
      ),
      p(
        "Старшите, които бяха ползвали инструмента, се представиха по-добре от връстниците си — знак, че са <em>научили</em> от него. При младшите среден ефект нямаше: резултатите се разцепиха към по-силни и по-слаби крайности. Статията е през National Bureau of Economic Research.",
      ),
      h2("Microsoft: Copilot пипа файловете на Windows"),
      image(imgMs, "Hybrid Intelligence: модели на устройството и в облака работят заедно върху локални файлове."),
      p(
        "На събитието Windows and Surface в Сан Франциско Microsoft показа Copilot, който намира данъчни документи из папките на компютъра, преименува ги, архивира ги и чернови имейл към счетоводител. Подходът се нарича <strong>Hybrid Intelligence</strong> — смесица от локални и облачни модели — и се очаква в Copilot през следващите месеци.",
      ),
      p(
        "Windows 11 получава и <strong>Execution Containers</strong> — sandbox за AI агенти, който според Сатя Надела ще достигне всеки потребител на Windows 11. Новият Surface Laptop Ultra с чип Nvidia RTX Spark за локални модели започва от 2599 долара.",
      ),
      h2("Биология: 300 млн. долара към виртуалната клетка"),
      p(
        "Biohub — изследователската организация, основана от Марк Зукърбърг и Присцила Чан — съобщи, че партньори са се ангажирали с общо около <strong>1,8 млрд. долара</strong> финансиране, данни и изчислителна мощ за AI модели, които предсказват поведението на клетки. Google DeepMind, Meta и Isomorphic Labs внасят заедно <strong>300 млн. долара</strong>. Министерството на енергетиката на САЩ планира над 500 млн. за пет години, а NIH предоставя съществуващи набори от данни. Целта е отворени данни, с които част от експериментите да се „проиграват“ дигитално преди лабораторията.",
      ),
      h2("SynthID излиза на публичен адрес"),
      image(imgSynth, "SynthID.com проверява дали изображение, видео или аудио носи воден знак."),
      p(
        "Google отвори <strong>SynthID.com</strong>, където всеки може да провери дали файл носи SynthID воден знак. Досега външни потребители разчитаха на Gemini. Checker-ът вече чете и водните знаци на партньори — включително OpenAI, Nvidia и Kakao, а Apple предстои. Отговорът е да/не, без да се оцветяват маркираните зони; нужен е вход с Google, OpenAI или Apple акаунт, а лимитът е около десет проверки на ден. Google твърди, че само Gemini е маркирал над 180 млрд. изображения и видеа.",
      ),
      h2("Съд: 18 месеца за AI стрийминг измама"),
      p(
        "Майкъл Смит от Северна Каролина получи <strong>18 месеца</strong> затвор и заповед да върне над 8 млн. долара — първото американско наказателно дело за AI-подпомогната стрийминг измама. В продължение на седем години създава стотици хиляди AI песни и хиляди фалшиви акаунти в Spotify, Apple Music, Amazon Music и YouTube Music. Само за един месец през 2023 г. песните му са натрупали 80,9 млн. слушания срещу 9,3 млн. за целия каталог на Тейлър Суифт през същия период. Прокуратурата казва, че парите са извадени от общия роялти пул на реалните артисти.",
      ),
      divider(),
      h2("Какво да следим оттук нататък"),
      list([
        "Дали Intelligent UI ще стане стандарт и при други чат продукти",
        "Как по-евтините малки модели променят архитектурата на агентите",
        "Дали формалните доказателства (Lean) ще станат задължителни при AI научни публикации",
        "Границите на агентите върху локални файлове и sandbox контрола в Windows",
        "Публичните инструменти за разпознаване на синтетично съдържание",
      ]),
      p(
        "<span class=\"np-text-muted\">Източници:</span> дневният брифинг на AI Pro Playbook от 8 октомври 2026 г. и цитираните там оригинални публикации на OpenAI, Anthropic, TechCrunch, The Verge, Ars Technica, Google Research, Biohub и свързани институции. Пълният списък е на <a href=\"https://aiproplaybook.com/top-ai-stories/2026-10-08\" target=\"_blank\" rel=\"noopener noreferrer\">aiproplaybook.com/top-ai-stories/2026-10-08</a>.",
      ),
      p("<em>Материалът е редакционна адаптация на публичен брифинг. Не съдържа измислени факти или числа извън посочените в източниците.</em>"),
    ];

    const parsed = articleBody.safeParse(body);
    if (!parsed.success) {
      console.error(parsed.error.flatten());
      throw new Error("articleBody validation failed");
    }

    const articleId = randomUUID();
    const title = "GPT-6 влиза в безплатния ChatGPT, OpenAI оттегли три математически статии";
    const excerpt =
      "OpenAI пусна GPT-6 за безплатните потребители с визуален Intelligent UI и в същия ден оттегли три математически статии. Anthropic намали цената на Haiku с около 75%. Плюс Copilot в Windows, Biohub, SynthID и присъда за AI стрийминг измама.";
    const slug = "gpt-6-chatgpt-openai-math-anthropic-8-oktomvri-2026";

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
        heroMediaId: hero,
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
        heroMediaId: hero,
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
    console.log(`  preview:  http://localhost:3001/articles/${articleId}/preview/`);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
