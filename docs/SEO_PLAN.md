# NewsPoint 2.0 — SEO и откриваемост

08.10.2026. Извадено от `docs/PLAN.md` по заявка на Коце. Този файл е единственото място за SEO, споделяне, sitemap, RSS, canonical адреси, redirects и готовност за Google. Общият план остава в `docs/PLAN.md` и сочи насам.

Не се прави deploy, commit или push от този файл. Свалянето на `noindex` и подаването към Google стават само с изрична молба от Коце.

08.10 — Коце възложи изпълнението на целия SEO план. После уточни: финалният домейн ще бъде `newspoint.bg`, но засега остава временният домейн, докато подготовката за SEO и AI откриваемост приключи. **S2 не се пуска сега; noindex остава.** Адресите в metadata/sitemap/RSS/llms следват текущия `WEB_URL`, не бъдещия домейн.

## 1. Обхват

Влиза тук:

- robots / `noindex` / `X-Robots-Tag`
- metadata (title, description, Open Graph, Twitter)
- canonical URL и trailing slash
- JSON-LD / schema.org
- share карти 1200×630
- sitemap (`/sitemap.xml`) и RSS (`/feed/`)
- redirects и запазване на WordPress адреси
- slug стабилност и колизии
- готовност за Search Console / Google News
- празнини в темите с продължение (`/temi/`), които засягат SEO
- AI откриваемост: достъпен server HTML, машинни указатели, публични структурни данни; добавено по уточнението на Коце от 08.10

Не влиза тук: PWA, push, LivePoint, Studio UX, мобилен визуален план (освен когато адресът/метаданните на мобилна страница са SEO въпрос).

## 2. Правила, които остават

- Архивът и старите адреси се пазят. Нова публикация не сменя адреса на вече публикувана статия.
- Адресите на статиите са `/{slug}/` със завършваща наклонена черта, както на стария WordPress сайт.
- Старият WordPress сайт и акаунтът `newspoint` не се пипат. Новият сайт е само `np2`.
- Сайтът е `noindex`, докато Коце не каже да се пуска за Google. Schema, sitemap и RSS могат да съществуват и при `noindex`.
- Търсенето и настройките не се индексират (`robots: index: false`).
- Страниците с архивен cursor (`/{рубрика}/archive/{cursor}/`) са `noindex, follow` — първата страница на рубриката е каноничната.
- Чернови и автентикирани отговори не се кешират публично.
- Няма връзка „Оригинал в newspoint.bg“ на публичната статия.
- Няма отделна публична страница на автор; линкът към `/author/` е махнат.

## 3. Какво вече е построено

### 3.1 robots / noindex

- Root metadata: `robots: { index: false, follow: false }` в `apps/web/app/layout.tsx`.
- HTTP header на всички пътища: `X-Robots-Tag: noindex, nofollow` в `apps/web/next.config.ts`.
- Локално и на временния домейн сайтът още не е готов за Google.
- Търсене (`/search/`): `noindex, follow`.
- Настройки (`/settings/`): `noindex, follow`.
- Offline (`/offline/`): `noindex, nofollow`.
- Архивни cursor страници: `noindex, follow`, с canonical към първата страница на рубриката; проверено и в production HTTP одита.
- `/robots.txt`: разрешава прочитането на публичния HTML и неговия noindex; изключва `/admin/`, `/api/`, `/draft/` и сочи към sitemap на текущия origin. Няма `Disallow: /`, който би скрил noindex от crawler-а. Това не отменя meta/HTTP noindex и не е защита вместо authentication.

### 3.2 URL и canonical

- Публичен origin идва от `shareOrigin()` (`apps/web/lib/share-card.ts`).
- Monorepo env се зарежда преди статичната metadata, за да няма различен origin на началото и динамичните страници. Origin се валидира: само HTTP(S), без credentials, path, query или fragment.
- Статии и рубрики: canonical в `generateMetadata` на `apps/web/app/[...path]/page.tsx` → `${origin}${path}`.
- Контакти и реклама: заглавие, описание и canonical през общия public-info шаблон; в sitemap при запазено `noindex`.
- Стар линк с `?cursor=` се пренасочва към `/{рубрика}/archive/{cursor}/` от `apps/web/proxy.ts` (Next 16; старото `middleware` е махнато).
- Canonical и пълни OG/Twitter има и на `/`, `/temi/`, тема, подкаст каталог/епизод, `/team/`, контакти и реклама чрез `public-metadata.ts`.
- Повторният обход допълни и публичните LivePoint landing страници (време, трафик, камери, сигнал, авторски материал) и всяка камера: canonical, описание, OG/Twitter и sitemap. За камера има брандирана карта с истинското име на `/share/camera/[slug]/`. Съдържанието, формите и личните API отговори не са променяни; публичните landing страници показват само входа към съответната функция.
- Стар theme slug се пренасочва с 308 директно към текущия slug. Няма вериги при повторни преименувания; непубликувана/бъдеща тема не се разкрива. Миграция 29 пази историята и резервира slug-овете атомарно с DB trigger, включително при конкурентен запис. Преди наличието ѝ URL промяната се отказва безопасно.
- Стар `/wp-content/uploads/...` URL се разрешава през `media_assets.source_url` към реалния `storage_key` и връща 308, включително JPG → WebP. Непознат, конфликтен или небезопасен mapping е 404. Стари resized WordPress варианти изискват достоверно съответствие; не се гадаят. Старият WordPress не се променя.
- Бутоните за споделяне на статия, тема и подкаст използват текущия canonical origin. Статията вече не споделя `sourceUrl` на стария WordPress; подкастът получава публичния origin от сървъра, а темата споделя абсолютен URL.
- Service worker не кешира `/api/*`, `/feed/`, `/sitemap.xml`.

### 3.3 Споделяне (Open Graph / Twitter / картинка)

Фаза B1 — направено.

- За статия и рубрика: title, description, `openGraph` / `twitter` с картина 1200×630.
- Картините се генерират на `/share/article/[id]/` и `/share/category/[id]/`.
- Добавени `/share/theme/[slug]/`, `/share/podcast/[slug]/` и `/share/page/[key]/` за потвърдените публични страници. При тема се използва реалната корица или снимка на публичен член; подкастът използва реалната обложка. Липсваща/повредена снимка дава брандирана карта с истинското заглавие. Няма placeholder снимка на измислена новина.
- Share endpoint за статия изключва чернови и публикации с бъдеща дата.
- Съдържание на картата: заглавие, рубрика и реална снимка — без измислена новина.
- Сайтът остава `noindex`, докато Коце не разреши индексиране.

### 3.4 Sitemap и RSS

Фаза B2 — направено.

- Sitemap: `/sitemap.xml` → `apps/web/app/sitemap.xml/route.ts` (`revalidate: 300`), sitemap index. Архивните Data Cache записи остават с 3600 s TTL.
  - `/sitemaps/pages.xml`: начало, теми, NewsPodcast, публични LivePoint landing страници/камери, екип, контакти/реклама и меню рубрики
  - `/sitemaps/articles-N.xml`: целият публичен архив, по 10 000 адреса в част, без стария таван 45 000
  - `/sitemaps/themes-N.xml` и `/sitemaps/podcasts-N.xml`: само публикувани записи с дата до текущия момент и текущите canonical slug-ове
  - `/sitemaps/news-N.xml`: истински публикации от последните 48 часа, до 1000 в част; оригинална дата, пълно заглавие, медия `NewsPoint.bg`, език `bg`. News Data Cache е 300 s; остарелите записи се филтрират и при отговора. News URL-ите умишлено присъстват и в общия архив. [Google news sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap).
  - Чернови, бъдещи публикации, търсене, настройки, cursor архиви и redirect aliases не влизат
  - Общ cache tag `public-sitemaps`; оторизираният revalidate endpoint опреснява целия набор. Article/story outbox paths и podcast/theme mutations включват sitemap; llms се опреснява за article/story промени. Без доставено revalidate събитие остава часовият TTL.
- RSS: `/feed/` → `apps/web/app/feed/route.ts`; обявен в root metadata като `application/rss+xml`.
- Не се подават към Google, докато стои `noindex`.
- При публикуване на подкаст епизод Studio `refresh()` чисти и `/feed/`, и `/sitemap.xml`.

### 3.5 JSON-LD (schema.org)

- Server-rendered `<script type="application/ld+json">` чрез `apps/web/components/json-ld.tsx`. Не е през `metadata` API (Next не го поддържа директно).
- Генератори: `apps/web/lib/jsonld.ts` (+ unit тестове в `apps/web/lib/jsonld.test.ts`).
- Обекти:
  - `NewsMediaOrganization` + `WebSite` (+ `SearchAction`) в root layout
  - `BreadcrumbList` на статии, рубрики, архив
  - `NewsArticle` на статия (headline, image, datePublished, dateModified, author, publisher, articleSection, inLanguage; builder поддържа wordCount, страницата не подава измислен брой)
  - `Person` за публичните профили в `/team/` (с потвърдени роли и биографии)
  - `CollectionPage` / `ItemList` на индекс и детайл на тема; редът е същият като в реално показаната хронология
- Organization има реалния съществуващ logo URL и потвърдените публични адрес/телефон/имейл.
- Sanitization: стойностите и ключовете минават през JSON encoding и `<` → `\u003c`; payload с `</script>` не може да прекъсне script елемента. Unit test проверява, че след JSON.parse съдържанието се запазва.
- Article image пази коректно и абсолютни медийни URL-и; dateModified идва от `articles.updatedAt`, без измислена текуща дата при рендер.
- Headline пази пълното видимо заглавие, без остарялото ограничение 110 знака. Потвърденият newsroom автор `NewsPoint.bg` е `Organization` със същия ID като медията; именуваните автори остават `Person`. [Google Article](https://developers.google.com/search/docs/appearance/structured-data/article).
- `max-image-preview:large` е подготвен в root robots metadata при запазено `noindex, nofollow`. Това разрешава големи изображения след реалното индексиране, не включва индексирането сега. [Google robots meta](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).
- Schema работи и при `noindex`. Когато се свали `noindex`, Google вижда данните без допълнителна реализация.

### 3.6 Metadata шаблон

- Default title: `NewsPoint.bg – Гласът на истината`
- Template: `%s | NewsPoint.bg`
- Default description: `Новини от Пловдив, България и света.`

## 4. Отворени SEO празнини (от кода и одитите)

S1 е реализирана. Тук остават външните стъпки при пускане и редакционните наблюдения.

### 4.1 Преди сваляне на noindex

1. Изрично решение на Коце да се махне `noindex` / `X-Robots-Tag` (layout + next.config).
2. Доменът `newspoint.bg` е потвърден от Коце. При реалното преминаване трябва проверка на HTTPS/host redirects и един `WEB_URL` върху финалния хост; това още не е изпълнено на production.
3. Подаване на sitemap в Google Search Console (само след стъпка 1–2).
4. Google News: няма задължителна ръчна регистрация/конфигурация на publication page в Publisher Center — Google премина към автоматично генерирани страници през март 2025. Отделен news sitemap остава опция, не условие за основния SEO код. [Официални указания](https://support.google.com/news/publisher-center/answer/15898024?hl=en).

### 4.2 Теми с продължение (`/temi/`)

Празнините от одита 05.10 са затворени в кода: canonical/share, sitemap и slug история с 308. Миграция 29 е намерена като налична при read-only одита на 08.10; този проход не я е прилагал. Историята се пази от прилагането нататък; загубени адреси от по-ранни преименувания не могат да се възстановят без достоверен стар запис.

### 4.3 Други

- Архивни cursor страници умишлено са `noindex` — да се запази при бъдещи промени.
- Sitemap index и podcast URL покритието вече са реализирани и проверени.
- Реалният архив има повторени заглавия/резюмета, празни excerpts и статии без hero. Групите и точните текущи бройки са в `tests/reports/seo/latest.json`. Текстове и медии не са пренаписвани автоматично; metadata има fallback към истинското заглавие, OG има брандиран fallback.
- Няма отделни `hreflang` — сайтът е само `bg-BG`.
- DPR/CLS/LCP не са SEO задача сами по себе си, но LCP на статията влияе на Search; измерването е отделно в общия план.

## 5. План за действие (SEO)

Работата е възложена на 08.10. S2 остава отложена по последващото уточнение на Коце.

### Фаза S0 — вече готово (не се преправя)

- Share карти 1200×630 за статия и рубрика
- Sitemap + RSS
- JSON-LD Organization / WebSite / Breadcrumb / NewsArticle / Person
- Canonical на статия и рубрика
- Redirect от `?cursor=` към archive път
- Trailing slash и запазени WordPress пътища

### Фаза S1 — изпълнена и проверена на 08.10

1. Canonical + Open Graph + Twitter за `/temi/` и `/temi/[slug]/` (както при статия).
2. Включване на публикуваните теми в sitemap.
3. Redirect или история при смяна на публикуван theme slug.
4. Преглед: podcast URL-и, contacts/advertising, team — пълни metadata и sitemap покритие.
5. Проверка за дублирани title/description и липсващ hero image в OG.

### Фаза S2 — следващ външен етап; отложен от Коце

1. След изрично разрешение: public `robots` index/follow в layout и махане на глобалния `X-Robots-Tag` noindex (или ограничаване до staging). Запазват се `max-image-preview:large` и page-level noindex за search/settings/offline/archive.
2. Потвърден production canonical host.
3. Submit на `/sitemap.xml` в Search Console.
4. По желание: Google News monitoring / news sitemap; Publisher Center не е задължителна registration стъпка.
5. Мониторинг: coverage, canonical mismatches, soft 404, index bloat от archive cursor (трябва да останат noindex).

### Фаза S3 — след пускане (по-късно)

- Rich results валидация за NewsArticle
- News sitemap е подготвен предварително на 08.10 в отделни `news-N.xml` части; видимостта и името на publication се проверяват в Google News след S2
- Sitemap index при >45k URL — направено предварително, за да не се реже архивът
- SEO подсказки за title/excerpt — направено: реалните знаци и съществуващите CMS лимити 200/400, обяснение за употребата при търсене/споделяне; няма нов publish gate или обещание за конкретен Google snippet размер

### AI откриваемост — техническа подготовка направена на 08.10

- `/llms.txt`: кратко описание на медията, публични контакти/екип, sitemap/RSS, истински последни статии и публикувани теми; 60 s ISR. Root HTML има `rel="describedby"` към файла.
- AI/search crawlers могат да прочетат реалния server HTML. Общият robots policy изключва частните пътища; не са добавяни отделни правила за използване на съдържание за обучение.
- `htmlLimitedBots` разширява запазения списък на pinned Next 16.3.6 с Googlebot и AI search/user агенти. Тези читатели получават metadata в `<head>` преди streaming. При upgrade трябва проверка на използвания Next internal export `HTML_LIMITED_BOT_UA_RE`. Съдържанието е същото; променя се само моментът на изпращане на metadata.
- JSON-LD дава свързани сайт/медия/автор/публикация/хронология с канонични адреси. Няма измислени статистики или авторски профили.
- `llms.txt` е допълнителна отворена спецификация, не гаранция за цитиране или индексиране. Google AI features използват основните SEO изисквания; видимостта там изисква индексирана страница. При текущия noindex има само готовност. [llms.txt](https://llmstxt.org/), [Google AI features](https://developers.google.com/search/docs/appearance/ai-features).

## 6. Код, който е източник на истина

| Тема | Файлове |
|---|---|
| robots / noindex | `apps/web/app/layout.tsx`, `apps/web/next.config.ts`, `apps/web/app/robots.ts`, `apps/web/lib/discovery.ts` |
| JSON-LD | `apps/web/lib/jsonld.ts`, `apps/web/components/json-ld.tsx` |
| Share OG image | `apps/web/app/share/article/[id]/route.ts`, `.../category/[id]/route.ts`, `apps/web/lib/share-card.ts` |
| Sitemap | `apps/web/app/sitemap.xml/route.ts`, `apps/web/app/sitemaps/[file]/route.ts`, `apps/web/lib/sitemap-{data,xml}.ts`, `apps/web/lib/sitemaps.ts` |
| RSS | `apps/web/app/feed/route.ts` |
| Canonical / OG meta | `apps/web/lib/public-metadata.ts`, article/category/theme/podcast/public-info pages |
| Cursor redirect | `apps/web/proxy.ts` |
| Archive noindex | `apps/web/app/[category]/archive/[cursor]/page.tsx` |
| Theme slug history | `packages/db/migrations/29_story_theme_slug_history.sql`, `packages/db/src/story-theme-slugs.ts`, Studio story mutations, `apps/web/lib/story-theme-redirect.ts` |
| WordPress media адреси | `apps/web/app/wp-content/uploads/[...path]/route.ts`, `apps/web/lib/legacy-media.ts` |
| AI указател | `apps/web/app/llms.txt/route.ts`, `apps/web/lib/discovery.ts` |
| Повторяем read-only SEO одит | `tests/seo/run-audit.ts`, `tests/seo/html-audit.ts`, `tests/reports/seo/latest.{md,json}` |

## 7. Връзка с общия план

- `docs/PLAN.md` фаза B (споделяне, sitemap, RSS) е изпълнена в кода; детайлите и следващите SEO стъпки живеят тук.
- Свалянето на `noindex` не е автоматична следваща фаза — изисква изрична молба.
- Контролираната смяна от WordPress и периодът за връщане остават в общия план; този файл пази само адресната/SEO част от миграцията.

## 8. Проверки и следваща стъпка — 08.10

- `node node_modules/vitest/vitest.mjs run --maxWorkers=2`: последният проход след подреждането на SEO тестовете — 93 файла passed, 2 skipped; 798 теста passed, 8 skipped. Първият проход с default workers имаше 9 push тестови грешки; самостоятелният push файл и пълният пакет с 2 workers минаха. Не са променяни push функциите.
- 08.10 — По молба на Коце четирите нови SEO test файла от `apps/web/lib/` са обединени в `tests/seo/public-seo.test.ts`. Премахнати са старите четири файла; всички проверки са запазени. Остават HTML audit тестът и повторяемият read-only одит за S2. Последният отчет е запазен за редакционния преглед; няма излишни временни файлове от този SEO проход. Публичният код и поведението не са променени. `git diff --check` е успешен.
- `tsc` за web, Studio и DB: успешно; окончателните `next build` за web и Studio също включиха успешна TypeScript проверка.
- `next build` web и Studio: успешно. Web има две съществуващи filesystem tracing warnings в `media-disk.ts`, извън SEO промяната.
- Read-only одит по SSH тунела към реалното съдържание и HTTP на локалното приложение: canonical/OG/Twitter/JSON-LD/noindex, реални 1200×630 share PNG-и, всички sitemap части, RSS, robots и llms. Проверена е и статия без hero. Точният последен резултат е в `tests/reports/seo/latest.md` и `.json`; съдържанието се променя от сървърния sync, затова бройките не са фиксиран продуктови данни.
- Финален локален production HTTP одит: **EXIT 0**, 14 HTML/share страници без грешки; 22 231 URL-а в 6 sitemap части; RSS 200/40 записа; robots/llms 200 с текущия origin; search/settings/offline/archive с noindex; archive canonical към рубриката; старият `?cursor=` връща валиден 308. Към момента на отчета: 22 208 публични статии, 8 групи повторени заглавия, 5 групи повторени описания, 5 празни excerpts и 47 без hero. Това е локална проверка с реални данни, не deploy или външна Google валидация.
- Изолиран PGlite: миграция 29, няколко преименувания, директен redirect към последния slug, връщане на собствен стар slug, отказ за чужд alias, SQL rollback при колизия, непубликувана тема, безопасен отказ без миграцията, sitemap филтри за draft/future записи.
- Не са правени live преименувания за тест, deploy, commit, push или подаване към Google. Паралелният `packages/db/src/scripts/apply-migration-29.ts` и предходните arrange/sidebar редакции не са променяни от този проход.
- Одитът се повтаря с `pnpm test:seo:audit` или директно `node apps/studio/node_modules/tsx/dist/cli.mjs tests/seo/run-audit.ts`. `SEO_BASE_URL` избира HTTP target; `WEB_URL` остава canonical origin. `--refresh-cache` е само за локален target и оторизирано опреснява локалните sitemap/RSS/llms кешове; SQL винаги е в read-only транзакция.
- **Следваща стъпка:** редакционен преглед на намерените реални duplicate/empty/hero случаи от отчета, без автоматично пренаписване на WordPress архива. S2/Google Rich Results/production coverage остават за реалното преминаване към `newspoint.bg` и ново изрично разрешение за индексиране. Това не е отметнато като пълно пускане към Google/AI Search.

## 9. Повторен преглед преди домейна и Cloudflare — 08.10

Коце възложи допълнителния преглед и доизпипване. Реализирани са корекциите в §3 и news sitemap. Новите проверки остават в съществуващите `tests/seo/` файлове и PGlite integration файла.

- Одитът сравнява целия sitemap с реалните публични DB адреси, проверява namespace/origin/дублиране, забранени или невалидни extras, 1000 news записи на част и двудневния прозорец. Нови статии от sync след първата snapshot се валидират с втори read-only прочит.
- HTTP проверките обхващат canonical/share/H1/NewsArticle, Google/Bing/AI/social `<head>`, истински 404 за липсващи/private адреси и malformed share UUID-и, оригинален JPG → реален WebP redirect, robots/llms/RSS и cursor redirect.
- `--expect-indexable` е бъдеща read-only проверка след S2: public noindex става грешка, а search/settings/offline/archive остават noindex. Флагът не променя индексирането, конфигурацията или домейна. Текущите проверки продължават в preview mode.
- Финален проход: **100 test файла passed, 2 skipped; 829 теста passed, 8 skipped**. Web production build и TypeScript — успешни, със същите две filesystem tracing warnings. `git diff --check` — успешен.
- Финален HTTP одит: **EXIT 0**, 20 HTML/share страници, 16 crawler head/HTML сценария и 9 missing/private 404 проверки; 22 273 уникални публични URL-а в 7 sitemap части, пълно DB покритие, 143 recent news URL-а; RSS 200/40; реален JPG → WebP → image 200. Всички 9 XML документа (index, 7 части, RSS) са парснати успешно с .NET XML parser. Бройките са snapshot от отчета, не фиксирани продуктови числа.
- Локалният production test server е стартиран с Node `--use-system-ca`, защото HTTPS към staging медията изисква доверения Windows certificate store в тази среда. TLS проверката е запазена. Няма промяна на сървърните сертификати, DNS, Cloudflare, live SQL или съдържанието.

### Подготвени настройки и приемане на Cloudflare — още не са прилагани

| Област | Настройка / доказателство при реалното пускане |
|---|---|
| Canonical host | `https://newspoint.bg`; HTTP и `www` → постоянен redirect към HTTPS apex, запазени path/query; по възможност един hop. Текущият временен домейн остава noindex или след смяната пренасочва публичните адреси към финалния. |
| Build/runtime | Един и същ `WEB_URL` при build и runtime; нов build при домейн смяна, защото има статична metadata/robots/feed. `STUDIO_PUBLIC_URL` и auth origins следват потвърдения публичен адрес. |
| TLS | Full (strict) с валиден origin certificate за final hostname и пълна chain. [Cloudflare Full strict](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/). |
| HTML / RSC | Запазване на origin `private/no-store` и bypass за HTML/RSC при първото пускане. В текущото приложение viewport/UA определят server shell, Next добавя RSC Vary. HTML edge cache изисква отделно доказани cache keys/варианти и purge при publish; общ `Cache Everything` би смесил тези отговори. [Default caching](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/), [Vary settings](https://developers.cloudflare.com/cache/concepts/vary/). |
| Private маршрути | Bypass за `/admin/`, auth, draft, private `/api/`, SSE и заявки с Authorization/auth cookies. Конкретното публично speech изключение е в общия план и не се разширява към останалото API. |
| Discovery | При първото пускане robots/sitemap/news/RSS/llms/share запазват origin freshness; без принудителен дълъг edge TTL. App revalidate не изчиства Cloudflare кеша. |
| Статични файлове | Кеш за versioned `/_next/static/`, публични media и brand според origin policy. При промяна на не-hashed brand/лого URL се прави purge; текущите brand headers са дълги. |
| Search / AI достъп | Проверка на ефективния robots.txt, Managed robots/AI policies и WAF logs след включването. Search/user crawlers трябва да могат да четат публични статии и снимки без challenge. Локален User-Agent тест не доказва достъп от реалните bot IP-и. Training policy остава отделна настройка. [Cloudflare managed robots](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/), [OpenAI crawlers](https://developers.openai.com/api/docs/bots). |
| Финално приемане | Origin spike условието остава в общия план. След разрешена S2: публичен HTTP одит с `--expect-indexable`, проверка на HTTPS/www/trailing slash/стари article и media URL-и, Rich Results и Search Console; purge на кеширания staging noindex. |

Остават редакционните duplicate/empty/hero случаи и проверка на историческите resized media адреси с достоверен mapping. Не е обещана максимална позиция или AI цитиране. DNS, Cloudflare account, deploy, старият WordPress и индексирането не са променяни.

## 10. Допълнителна SEO/AI подготовка в кода — 08.10

Коце изрично възложи полезните допълнения, които могат да се направят самостоятелно преди домейна. Реализирано е без промяна на публичната визия:

- Авторите в NewsArticle могат да сочат към точната видима биография в `/team/#...`, със същия Person `@id` и `url`. Четирите вече одобрени публични имена са споделени между team и article кода в `apps/web/lib/public-team.ts`. За служебен автор се използва само изрично публичен профил и съвпадащо име; това е част от съществуващата article SQL заявка, без нов DB round trip. Неизвестни имена и различни/частни профили не получават предполагаема самоличност. Не е създавана отделна авторска страница. Това следва [Google author markup best practices](https://developers.google.com/search/docs/appearance/structured-data/article#author-bp).
- NewsArticle има явен canonical `url` и връзка към WebSite. Авторът „NewsPoint.bg“ запазва Organization идентичността си.
- Подкастите имат server-rendered [PodcastSeries](https://schema.org/PodcastSeries), [PodcastEpisode](https://schema.org/PodcastEpisode), [AudioObject](https://schema.org/AudioObject), BreadcrumbList и каталог на видимите епизоди. Данните са реални: име, редакционно резюме, оригинална дата, продължителност, обложка, audio URL, издател и серия. Маркират се само показаните до 10 епизода; няма измислен общ брой, поредни номера, водещи или транскрипция. Това не обещава Google podcast rich result.
- `/llms.txt` вече дава и оригиналната публикационна дата в ISO UTC и съществуващото редакционно резюме на последните статии. Markdown текстът се екранира; липсваща/невалидна дата или празно резюме не се измислят. Файлът остава допълнителен указател с 60 s ISR.
- Поправен е пропуск в `packages/db/src/podcasts.ts`: директният публичен audio lookup изисква едновременно `published` и настъпила `published_at`, както страницата и sitemap. Draft/future/null-date епизоди не могат да се слушат през познат audio ID.
- Променените production файлове: `apps/web/lib/{public-team,queries,jsonld,discovery}.ts`, article catch-all page, team page, podcast index/detail pages и `packages/db/src/podcasts.ts`. Проверките са допълнени в съществуващите SEO/JSON-LD/PGlite файлове; няма нови test файлове.

### Доказателства и оставащо

- Пълен Vitest проход: **100 файла passed, 2 skipped; 836 теста passed, 8 skipped**. Изолираният Postgres тест проверява private → public профил, различно име, manual автор и недостъпно future/draft podcast audio. Няма записи в live DB.
- Web production build и включената TypeScript проверка — успешни. Отделни DB и Studio TypeScript проверки — успешни. Остават същите две filesystem tracing warnings в `media-disk.ts`. `git diff --check` — успешен.
- Локален production HTTP одит с реалната DB, **EXIT 0** от `2026-10-08T12:02:13Z`: 20 HTML/share страници, 16 crawler сценария, 15 missing/private 404 проверки. Двете реални podcast страници имат правилни Episode/Audio/Series връзки; четирите публични team URL-а сочат към съществуващи HTML биографии. Частните podcast page/audio/share адреси връщат 404. Нямаше реални статии с public Person byline в тази snapshot за допълнителната author извадка; този branch е проверен с изолиран Postgres и одобрените публични имена с unit проверки.
- Sitemap: 22 277 уникални URL-а в 7 части, пълно DB покритие, 143 recent news URL-а. RSS 200/40; реален WordPress image redirect → WebP 200. Бройките са snapshot, а не фиксирани продуктови числа. Отчет: `tests/reports/seo/latest.{md,json}`.
- Това е техническа готовност за разпознаване и цитиране, а не интеграция, която нарежда на модел да предпочита NewsPoint. [Google AI features](https://developers.google.com/search/docs/appearance/ai-features) използват основните SEO изисквания, съответствие на schema с видимото съдържание и индексирани страници; не изискват специална AI схема.
- **Следваща стъпка:** редакционният преглед на реалните duplicate/empty/hero случаи остава отворен. После реалният домейн/Cloudflare и S2 с изрично разрешение за индексиране, публичен одит, Rich Results и Search Console. Текущият `noindex` е запазен; не са правени deploy, SQL миграция, DNS/Cloudflare настройки или изпращане към външен AI доставчик.
