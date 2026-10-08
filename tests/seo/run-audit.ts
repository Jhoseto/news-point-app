/** Read-only live-content audit. Never writes to Postgres or changes indexing. */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { createScriptDb, findRepoRoot } from "../../packages/db/src/node";
import { decode, inspectSeoHtml } from "./html-audit";
import { PUBLIC_MENU } from "../../packages/content/src/menu";
import { CAMERA_CATALOG } from "../../apps/web/lib/livepoint/cameras/catalog";

const root = findRepoRoot();
const sharp = createRequire(resolve(root, "apps/web/package.json"))("sharp");
const { db, close } = createScriptDb();
const base = (process.env.SEO_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const origin = new URL((process.env.WEB_URL ?? "https://newspoint.bg").trim()).origin;
const dir = resolve(root, "tests/reports/seo");
const expectIndexable = process.argv.includes("--expect-indexable");
const staticPaths = ["/", "/temi/", "/livepoint/podcast/", "/livepoint/weather/", "/livepoint/traffic/", "/livepoint/cameras/", "/livepoint/report/", "/livepoint/my-news/", "/team/", "/contacts/", "/advertising/"];
let auditPhase = "content read";

async function request(path: string, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, { redirect: "manual", headers: { "user-agent": "Googlebot", ...headers }, signal: AbortSignal.timeout(30_000) });
}
function rows<T>(result: unknown): T[] { return result as T[]; }

try {
  const content = await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    const summary = rows<Record<string, number>>(await tx.execute(sql`
      select count(*)::int as articles,
      count(*) filter (where trim(excerpt) = '')::int as empty_excerpts,
      count(*) filter (where hero_media_id is null)::int as missing_hero_images
      from articles where is_public and published_at <= now()`))[0];
    const duplicateTitles = rows<{ text: string; count: number; paths: string[] }>(await tx.execute(sql`
      select lower(trim(title)) as text, count(*)::int as count, array_agg(path order by path) as paths
      from articles where is_public and published_at <= now() group by lower(trim(title)) having count(*) > 1 order by count(*) desc limit 20`));
    const duplicateDescriptions = rows<{ text: string; count: number; paths: string[] }>(await tx.execute(sql`
      select lower(trim(excerpt)) as text, count(*)::int as count, array_agg(path order by path) as paths
      from articles where is_public and published_at <= now() and trim(excerpt) <> '' group by lower(trim(excerpt)) having count(*) > 1 order by count(*) desc limit 20`));
    const articles = rows<{ path: string }>(await tx.execute(sql`select path from articles where is_public and published_at <= now() order by published_at desc limit 3`));
    const withoutHero = rows<{ path: string }>(await tx.execute(sql`select path from articles where is_public and published_at <= now() and hero_media_id is null order by published_at desc limit 1`));
    const themes = rows<{ path: string }>(await tx.execute(sql`select '/temi/' || slug || '/' as path from story_themes where is_published and published_at <= now() order by published_at desc limit 3`));
    const podcasts = rows<{ path: string }>(await tx.execute(sql`select '/livepoint/podcast/' || slug || '/' as path from podcasts where status = 'published' and published_at <= now() order by published_at desc limit 3`));
    const migration = rows<{ ready: boolean }>(await tx.execute(sql`select to_regclass('public.story_theme_slugs') is not null as ready`))[0]?.ready ?? false;
    const expectedPaths = rows<{ path: string }>(await tx.execute(sql`
      select path from articles where is_public and published_at <= now()
      union all select '/temi/' || slug || '/' from story_themes where is_published and published_at <= now()
      union all select '/livepoint/podcast/' || slug || '/' from podcasts where status = 'published' and published_at <= now()`)).map((row) => row.path);
    const sections = rows<{ path: string; slug: string }>(await tx.execute(sql`select path, slug from categories where kind = 'section'`));
    const menu = new Set(PUBLIC_MENU.map((entry) => entry.slug));
    expectedPaths.push(...sections.filter((section) => menu.has(section.slug)).map((section) => section.path), ...staticPaths, ...CAMERA_CATALOG.map((camera) => `/livepoint/cameras/${camera.slug}/`));
    const hiddenSamples = rows<{ id: string; path: string }>(await tx.execute(sql`select id, path from articles where not is_public or published_at > now() or published_at is null order by updated_at desc limit 3`));
    const mediaRow = rows<{ sourceUrl: string; storageKey: string }>(await tx.execute(sql`
      select m.source_url as "sourceUrl", m.storage_key as "storageKey"
      from media_assets m join articles a on a.hero_media_id = m.id
      where a.is_public and a.published_at <= now() and m.storage_key like 'news/%' and m.source_url like '%/wp-content/uploads/%'
      order by a.published_at desc limit 1`))[0];
    const legacyMedia = mediaRow ? { path: new URL(mediaRow.sourceUrl).pathname, destination: new URL(`/media/${mediaRow.storageKey}`, origin).pathname } : null;
    return { summary, duplicateTitles, duplicateDescriptions, samples: [...articles, ...withoutHero, ...themes, ...podcasts], migration29: migration, expectedPaths, hiddenSamples, legacyMedia };
  });
  let cacheRefreshed = false;
  if (process.argv.includes("--refresh-cache")) {
    if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Cache refresh is local-only");
    if (!process.env.REVALIDATE_SECRET) throw new Error("Local cache refresh requires REVALIDATE_SECRET");
    const response = await fetch(`${base}/api/revalidate/`, { method: "POST", headers: { "content-type": "application/json", "x-revalidate-secret": process.env.REVALIDATE_SECRET }, body: JSON.stringify({ paths: ["/sitemap.xml", "/llms.txt", "/feed/"] }) });
    cacheRefreshed = response.ok;
    if (!cacheRefreshed) throw new Error("Local cache refresh failed");
  }
  const pages = [];
  let archivePath: string | null = null;
  const paths = [...staticPaths, "/plovdiv/", ...(CAMERA_CATALOG[0] ? [`/livepoint/cameras/${CAMERA_CATALOG[0].slug}/`] : []), ...content.samples.map((row) => row.path)];
  for (const path of paths) {
    auditPhase = `HTML ${path}`;
    const response = await request(path);
    const html = await response.text();
    if (path === "/plovdiv/") archivePath = html.match(/href="(\/plovdiv\/archive\/[^"?#]+\/)"/)?.[1] ?? null;
    const meta = inspectSeoHtml(html);
    const errors = [...meta.errors];
    if (response.status !== 200) errors.push(`HTTP ${response.status}`);
    if (meta.titles.length !== 1 || !meta.titles[0]) errors.push("Missing/duplicate title");
    if (meta.descriptions.length !== 1 || !meta.descriptions[0]) errors.push("Missing/duplicate description");
    if (meta.canonicals.length !== 1 || meta.canonicals[0] !== `${origin}${path}`) errors.push("Canonical mismatch");
    if (meta.ogUrl[0] !== `${origin}${path}`) errors.push("OG URL mismatch");
    if (!meta.ogTitle[0] || !meta.ogDescription[0] || !meta.ogImages[0]) errors.push("Incomplete OG");
    if (meta.twitterCard[0] !== "summary_large_image") errors.push("Missing Twitter card");
    const noindexMeta = meta.robots.some((value) => value.includes("noindex"));
    const noindexHeader = response.headers.get("x-robots-tag")?.includes("noindex") ?? false;
    if (expectIndexable ? noindexMeta || noindexHeader : !noindexMeta || !noindexHeader) errors.push(expectIndexable ? "Public page still has noindex" : "Preview noindex missing");
    const podcastIndex = path === "/livepoint/podcast/";
    if (meta.shareUrls.some((url) => podcastIndex ? !url.startsWith(`${origin}/livepoint/podcast/`) : url !== `${origin}${path}`)) errors.push("Share button does not use the canonical URL");
    if (meta.articleHeadlines.some((title) => !meta.headlines.includes(title))) errors.push("NewsArticle headline differs from the visible H1");
    let image = null;
    if (meta.ogImages[0]) {
      const url = new URL(meta.ogImages[0]);
      const imageResponse = await request(url.pathname);
      if (imageResponse.ok) {
        const info = await sharp(Buffer.from(await imageResponse.arrayBuffer())).metadata();
        image = { status: imageResponse.status, width: info.width, height: info.height };
        if (info.width !== 1200 || info.height !== 630) errors.push("OG dimensions are not 1200x630");
      } else errors.push(`OG image HTTP ${imageResponse.status}`);
    }
    pages.push({ path, status: response.status, ...meta, image, errors });
    console.log(`${path}: ${errors.length ? errors.join("; ") : "OK"}`);
  }
  auditPhase = "sitemap index";
  const sitemapResponse = await request("/sitemap.xml");
  const sitemapBody = await sitemapResponse.text();
  const indexUrls = [...sitemapBody.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]!));
  const indexValid = sitemapBody.includes('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"') && new Set(indexUrls).size === indexUrls.length && indexUrls.every((url) => url.startsWith(`${origin}/sitemaps/`) && url.endsWith(".xml"));
  const parts = indexUrls.map((url) => new URL(url).pathname);
  const sitemaps = [];
  const allUrls = new Set<string>();
  const newsUrls = new Set<string>();
  for (const path of parts) {
    auditPhase = `sitemap ${path}`;
    const response = await request(path);
    const body = await response.text();
    const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]!));
    const isNews = path.startsWith("/sitemaps/news-");
    const target = isNews ? newsUrls : allUrls;
    const duplicateUrls: string[] = [];
    const errors: string[] = [];
    for (const url of urls) {
      if (target.has(url)) duplicateUrls.push(url);
      target.add(url);
      try { const parsed = new URL(url); if (parsed.origin !== origin || parsed.search || parsed.hash) errors.push("Noncanonical sitemap URL"); }
      catch { errors.push("Invalid sitemap URL"); }
    }
    if (!body.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')) errors.push("Missing sitemap namespace");
    if (urls.length > (isNews ? 1000 : 50000)) errors.push("Sitemap exceeds URL limit");
    if (isNews) {
      const dates = [...body.matchAll(/<news:publication_date>([^<]+)<\/news:publication_date>/g)].map((match) => Date.parse(match[1]!));
      if (dates.length !== urls.length || dates.some((date) => !Number.isFinite(date) || date < Date.now() - 48 * 60 * 60 * 1000 - 1000 || date > Date.now())) errors.push("Invalid news publication window");
      if ([...body.matchAll(/<news:title>[\s\S]*?<\/news:title>/g)].length !== urls.length) errors.push("Missing news titles");
    }
    sitemaps.push({ path, status: response.status, urls: urls.length, duplicateUrls, errors });
  }
  const missingPaths = content.expectedPaths.filter((path) => !allUrls.has(`${origin}${path}`));
  const expected = new Set(content.expectedPaths.map((path) => `${origin}${path}`));
  const extraUrls = [...allUrls].filter((url) => !expected.has(url));
  // Sync may publish new rows after the first snapshot. Validate extras against
  // a fresh read-only snapshot instead of reporting legitimate new stories as leaks.
  const invalidExtraUrls = extraUrls.length ? await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    const current = rows<{ path: string }>(await tx.execute(sql`
      select path from articles where is_public and published_at <= now()
      union all select '/temi/' || slug || '/' from story_themes where is_published and published_at <= now()
      union all select '/livepoint/podcast/' || slug || '/' from podcasts where status = 'published' and published_at <= now()`));
    const allowed = new Set([...expected, ...current.map((row) => `${origin}${row.path}`)]);
    return extraUrls.filter((url) => !allowed.has(url));
  }) : [];
  const invalidNewsUrls = [...newsUrls].filter((url) => !allUrls.has(url));
  const feed = await request("/feed/");
  const feedBody = await feed.text();
  const discovery = [];
  for (const path of ["/robots.txt", "/llms.txt"]) {
    auditPhase = path;
    const response = await request(path);
    const text = await response.text();
    discovery.push({ path, status: response.status, includesCurrentHost: text.includes(origin), contentType: response.headers.get("content-type") });
  }
  const exclusions = [];
  for (const path of ["/search/?q=plovdiv", "/settings/", "/offline/", ...(archivePath ? [archivePath] : [])]) {
    auditPhase = `exclusion ${path}`;
    const response = await request(path);
    const meta = inspectSeoHtml(await response.text());
    exclusions.push({ path, status: response.status, robots: meta.robots, canonical: meta.canonicals, valid: response.ok && meta.robots.some((value) => value.includes("noindex")) && (!path.includes("/archive/") || meta.canonicals[0] === `${origin}/plovdiv/`) });
  }
  let cursorRedirect = null;
  if (archivePath) {
    auditPhase = "cursor redirect";
    const cursor = archivePath.split("/").at(-2)!;
    const response = await fetch(`${base}/plovdiv/?cursor=${cursor}`, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    const location = response.headers.get("location");
    cursorRedirect = { status: response.status, destination: location ? new URL(location, base).pathname : null, valid: response.status === 308 && location !== null && new URL(location, base).pathname === archivePath };
  }
  const crawlerChecks = [];
  for (const userAgent of ["Googlebot", "Googlebot Smartphone (Android; Mobile)", "Bingbot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "facebookexternalhit", "Twitterbot"]) {
    for (const path of ["/", content.samples[0]?.path].filter((path): path is string => !!path)) {
      auditPhase = `crawler ${userAgent} ${path}`;
      const response = await request(path, { "user-agent": userAgent });
      const meta = inspectSeoHtml(await response.text());
      const errors = [...meta.errors];
      if (response.status !== 200 || meta.headCanonicals[0] !== `${origin}${path}`) errors.push("Missing canonical in crawler head or wrong HTTP status");
      if (path !== "/" && (meta.headlines.length !== 1 || !meta.articleHeadlines.includes(meta.headlines[0]!))) errors.push("Article content is not available in server HTML");
      if (response.headers.get("cf-mitigated") === "challenge") errors.push("Cloudflare challenge blocks the crawler request");
      crawlerChecks.push({ path, userAgent, status: response.status, errors, cacheControl: response.headers.get("cache-control"), vary: response.headers.get("vary"), cfCacheStatus: response.headers.get("cf-cache-status") });
    }
  }
  const notFoundChecks = [];
  const malformedId = "-".repeat(36);
  const missingPathsToTest = ["/seo-missing-path-01a11a5c/", "/temi/seo-missing-path-01a11a5c/", "/livepoint/podcast/seo-missing-path-01a11a5c/", "/sitemaps/articles-999999.xml", "/sitemaps/articles--1.xml", `/share/article/${malformedId}/`, `/share/category/${malformedId}/`, ...content.hiddenSamples.flatMap((row) => [row.path, `/share/article/${row.id}/`])];
  for (const path of missingPathsToTest) {
    auditPhase = `404 ${path}`;
    const response = await request(path);
    await response.arrayBuffer();
    notFoundChecks.push({ path, status: response.status, valid: response.status === 404 });
  }
  let mediaRedirect = null;
  if (content.legacyMedia) {
    auditPhase = "legacy media redirect";
    const response = await request(content.legacyMedia.path);
    await response.arrayBuffer();
    const location = response.headers.get("location");
    const destination = location ? new URL(location, base).pathname : null;
    const imageResponse = destination ? await request(destination) : null;
    const bytes = imageResponse?.ok ? Buffer.from(await imageResponse.arrayBuffer()) : null;
    const image = bytes ? await sharp(bytes).metadata() : null;
    mediaRedirect = { path: content.legacyMedia.path, status: response.status, destination, imageStatus: imageResponse?.status, format: image?.format, width: image?.width, valid: response.status === 308 && destination === content.legacyMedia.destination && imageResponse?.status === 200 && !!image?.width };
  }
  const { expectedPaths, hiddenSamples, ...reportedContent } = content;
  const sitemapOk = sitemapResponse.ok && indexValid && parts.length > 0 && sitemaps.every((part) => part.status === 200 && part.duplicateUrls.length === 0 && part.errors.length === 0) && missingPaths.length === 0 && invalidExtraUrls.length === 0 && invalidNewsUrls.length === 0;
  const errors = [
    ...pages.flatMap((page) => page.errors),
    ...exclusions.filter((page) => !page.valid).map((page) => `Invalid indexing metadata: ${page.path}`),
    ...(cursorRedirect?.valid === false ? ["Invalid cursor redirect"] : []),
    ...crawlerChecks.flatMap((check) => check.errors.map((error) => `${check.userAgent} ${check.path}: ${error}`)),
    ...notFoundChecks.filter((check) => !check.valid).map((check) => `Expected 404: ${check.path}`),
    ...(mediaRedirect?.valid === false ? ["Legacy media redirect failed"] : []),
    ...discovery.filter((page) => page.status !== 200 || !page.includesCurrentHost).map((page) => `Discovery failed: ${page.path}`),
    ...(!sitemapOk ? ["Sitemap coverage or validation failed"] : []),
    ...(!feed.ok ? ["RSS failed"] : []),
  ];
  const report = { at: new Date().toISOString(), base, canonicalOrigin: origin, mode: expectIndexable ? "read-only indexable check" : "preview, noindex retained", cacheRefreshed, errors, content: reportedContent, pages, discovery, exclusions, crawlerChecks, notFoundChecks, cursorRedirect, mediaRedirect, sitemap: { status: sitemapResponse.status, valid: sitemapOk, parts: sitemaps, totalUrls: allUrls.size, expectedUrls: new Set(expectedPaths).size, missingPaths: missingPaths.slice(0, 100), invalidExtraUrls, newsUrls: newsUrls.size, invalidNewsUrls }, feed: { status: feed.status, items: [...feedBody.matchAll(/<item>/g)].length }, limitations: ["Editorial duplicate groups are bounded to the top 20; text is never rewritten.", "Local schema checks are not Google's Rich Results Test.", "No Search Console or production index coverage is inspected.", "User-Agent checks test server HTML, not verified bot-IP access through Cloudflare WAF.", "One copied legacy hero is checked, not the entire media archive or historical resized variants.", "Archive sitemap cache TTL is one hour, news TTL is five minutes. Use --refresh-cache locally after updates."] };
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "latest.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve(dir, "latest.md"), `# SEO audit\n\n${report.at}\n\nApp: ${base}; canonical: ${origin}. Mode: ${report.mode}.\n\n- HTML/share pages: ${pages.length}; total errors: ${errors.length}.\n- Sitemap: ${report.sitemap.totalUrls} unique URLs in ${sitemaps.length} parts; full database coverage: ${sitemapOk ? "PASS" : "FAIL"}; recent news: ${newsUrls.size}.\n- Crawler HTML/head checks: ${crawlerChecks.length}; PASS: ${crawlerChecks.filter((check) => !check.errors.length).length}.\n- Missing/private URL checks: ${notFoundChecks.length}; PASS: ${notFoundChecks.filter((check) => check.valid).length}.\n- Legacy copied image redirect: ${mediaRedirect?.valid ? "PASS" : "not verified"}.\n- RSS: HTTP ${feed.status}, ${report.feed.items} items.\n- Public content: ${content.summary?.articles} articles; ${content.summary?.empty_excerpts} empty excerpts; ${content.summary?.missing_hero_images} without hero image.\n- Migration 29 present: ${content.migration29}.\n${errors.length ? `\nErrors:\n${errors.map((error) => `- ${error}`).join("\n")}\n` : ""}\nDetailed results and editorial duplicate groups: latest.json. External Google validation and Cloudflare bot-IP access are pending.\n`);
  console.log(`Report: tests/reports/seo/latest.md; pages=${pages.length}, errors=${errors.length}, sitemap=${sitemapOk ? "PASS" : "FAIL"}`);
  if (errors.length) process.exitCode = 1;
} catch (error) {
  console.error("SEO audit failed at", auditPhase, ":", error instanceof Error ? error.name : "unknown error");
  process.exitCode = 1;
} finally { await close(); }
