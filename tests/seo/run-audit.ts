/** Read-only live-content audit. Never writes to Postgres or changes indexing. */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { createScriptDb, findRepoRoot } from "../../packages/db/src/node";
import { inspectSeoHtml } from "./html-audit";

const root = findRepoRoot();
const sharp = createRequire(resolve(root, "apps/web/package.json"))("sharp");
const { db, close } = createScriptDb();
const base = (process.env.SEO_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const origin = new URL((process.env.WEB_URL ?? "https://newspoint.bg").trim()).origin;
const dir = resolve(root, "tests/reports/seo");
let auditPhase = "content read";

async function request(path: string) {
  return fetch(`${base}${path}`, { headers: { "user-agent": "Googlebot" }, signal: AbortSignal.timeout(30_000) });
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
    return { summary, duplicateTitles, duplicateDescriptions, samples: [...articles, ...withoutHero, ...themes, ...podcasts], migration29: migration };
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
  const paths = ["/", "/temi/", "/livepoint/podcast/", "/team/", "/contacts/", "/advertising/", "/plovdiv/", ...content.samples.map((row) => row.path)];
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
    if (!response.headers.get("x-robots-tag")?.includes("noindex") || !meta.robots.some((value) => value.includes("noindex"))) errors.push("Preview noindex missing");
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
  const parts = [...sitemapBody.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]!).pathname);
  const sitemaps = [];
  const allUrls = new Set<string>();
  for (const path of parts) {
    auditPhase = `sitemap ${path}`;
    const response = await request(path);
    const body = await response.text();
    const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);
    const duplicateUrls = urls.filter((url) => allUrls.has(url));
    urls.forEach((url) => allUrls.add(url));
    sitemaps.push({ path, status: response.status, urls: urls.length, duplicateUrls });
  }
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
  const report = { at: new Date().toISOString(), base, canonicalOrigin: origin, mode: "preview, noindex retained", cacheRefreshed, content, pages, discovery, exclusions, cursorRedirect, sitemap: { status: sitemapResponse.status, parts: sitemaps, totalUrls: allUrls.size, containsAllSamplePages: paths.every((path) => allUrls.has(`${origin}${path}`)) }, feed: { status: feed.status, items: [...feedBody.matchAll(/<item>/g)].length }, limitations: ["Content duplicate groups are bounded to the top 20; editorial text is never rewritten by this audit.", "Local schema checks are not Google's Rich Results Test.", "No Search Console or production index coverage is inspected.", "No live content is renamed or published to test redirects; migration behavior is verified in PGlite.", "Sitemaps have one-hour cache TTL. Use --refresh-cache locally to distinguish cache delay from missing coverage."] };
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "latest.json"), JSON.stringify(report, null, 2));
  const errors = [
    ...pages.flatMap((page) => page.errors),
    ...exclusions.filter((page) => !page.valid).map((page) => `Invalid indexing metadata: ${page.path}`),
    ...(cursorRedirect?.valid === false ? ["Invalid cursor redirect"] : []),
  ];
  const sitemapOk = sitemapResponse.ok && sitemaps.every((part) => part.status === 200 && part.duplicateUrls.length === 0) && report.sitemap.containsAllSamplePages;
  writeFileSync(resolve(dir, "latest.md"), `# SEO audit\n\n${report.at}\n\nLocal app: ${base}; canonical: ${origin}. Preview noindex retained.\n\n- HTML/share pages: ${pages.length}; errors: ${errors.length}.\n- Sitemap: ${report.sitemap.totalUrls} URLs in ${sitemaps.length} parts; coverage check: ${sitemapOk ? "PASS" : "FAIL"}.\n- RSS: HTTP ${feed.status}, ${report.feed.items} items.\n- Public content: ${content.summary?.articles} articles; ${content.summary?.empty_excerpts} empty excerpts; ${content.summary?.missing_hero_images} without hero image.\n- Migration 29 present: ${content.migration29}.\n\nDetailed results and editorial duplicate groups: latest.json. External Google validation and production indexing are pending.\n`);
  console.log(`Report: tests/reports/seo/latest.md; pages=${pages.length}, errors=${errors.length}, sitemap=${sitemapOk ? "PASS" : "FAIL"}`);
  if (errors.length || !sitemapOk || !feed.ok || discovery.some((page) => page.status !== 200 || !page.includesCurrentHost) || exclusions.some((page) => !page.valid) || cursorRedirect?.valid === false) process.exitCode = 1;
} catch (error) {
  console.error("SEO audit failed at", auditPhase, ":", error instanceof Error ? error.name : "unknown error");
  process.exitCode = 1;
} finally { await close(); }
