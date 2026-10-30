/** Read-only city discovery audit. Fetches public documents; no database, keys or cache mutations. */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decode, inspectSeoHtml } from "./html-audit";

const base = new URL(process.env.SEO_BASE_URL ?? "http://127.0.0.1:3000");
if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("SEO_BASE_URL must be a plain HTTP(S) origin");
const expectedOrigin = new URL(process.env.SEO_EXPECTED_ORIGIN ?? (base.hostname === "127.0.0.1" || base.hostname === "localhost" ? `${base.protocol}//localhost${base.port ? `:${base.port}` : ""}` : base.origin)).origin;
const expectIndexable = process.argv.includes("--expect-indexable");
const reportDir = fileURLToPath(new URL("../reports/city-seo/", import.meta.url));
const errors: string[] = [];
const pages: Record<string, unknown>[] = [];
const htmlByPath = new Map<string, string>();
const observedTitles = new Map<string, string>();
const observedDescriptions = new Map<string, string>();
const stripScripts = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const textOnly = (html: string) => decode(stripScripts(html).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const links = (html: string) => [...stripScripts(html).matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map(match => decode(match[1]!));

async function request(path: string) {
  const started = performance.now();
  const response = await fetch(new URL(path, base), { redirect: "manual", headers: { "user-agent": "Googlebot" }, signal: AbortSignal.timeout(30_000) });
  const body = await response.text();
  return { response, body, durationMs: Math.round(performance.now() - started) };
}

async function auditPage(path: string, kind: "collection" | "event" | "private" | "missing") {
  const { response, body, durationMs } = await request(path);
  htmlByPath.set(path, body);
  const seo = inspectSeoHtml(body);
  const problems = [...seo.errors];
  let eventDetail: Record<string, unknown> | undefined;
  const noindexMeta = seo.robots.some(value => /(?:^|[,\s])noindex(?:$|[,\s])/i.test(value));
  const noindexHeader = /(?:^|[,\s])noindex(?:$|[,\s])/i.test(response.headers.get("x-robots-tag") ?? "");
  if (kind === "missing") {
    if (response.status !== 404) problems.push(`Missing route returned HTTP ${response.status}`);
  } else {
    if (response.status !== 200) problems.push(`HTTP ${response.status}`);
    if (kind === "private") {
      if (!noindexMeta && !noindexHeader) problems.push("Personal saved page is indexable");
    } else {
      if (seo.titles.length !== 1 || !seo.titles[0]) problems.push("Missing/duplicate title");
      if (seo.descriptions.length !== 1 || !seo.descriptions[0]) problems.push("Missing/duplicate description");
      if (seo.canonicals.length !== 1 || seo.canonicals[0] !== `${expectedOrigin}${path}`) problems.push("Canonical mismatch");
      if (seo.ogUrl[0] !== `${expectedOrigin}${path}`) problems.push("OG URL mismatch");
      if (!seo.ogTitle[0] || !seo.ogDescription[0] || !seo.ogImages[0]) problems.push("Incomplete social preview");
      if (seo.headlines.length !== 1) problems.push(`Expected one H1, found ${seo.headlines.length}`);
      if (expectIndexable ? noindexMeta || noindexHeader : !noindexMeta) problems.push(expectIndexable ? "Public content rejects indexing" : "Preview noindex missing");
      if (!seo.jsonLdTypes.includes("BreadcrumbList")) problems.push("Missing breadcrumb schema");
      if (kind === "collection" && !seo.jsonLdTypes.includes("CollectionPage")) problems.push("Missing CollectionPage schema");
      for (const [value, previous, label] of [[seo.titles[0], observedTitles, "title"], [seo.descriptions[0], observedDescriptions, "description"]] as const) {
        if (value && previous.has(value)) problems.push(`Duplicate ${label} with ${previous.get(value)}`);
        if (value) previous.set(value, path);
      }
      const visible = textOnly(body);
      if (kind === "event") {
        if (!seo.jsonLdTypes.includes("WebPage")) problems.push("Missing event WebPage schema");
        if (!visible.includes("По програмата на")) problems.push("Source attribution absent from server HTML");
        if (!/<time\b[^>]*datetime=["']\d{4}-\d{2}-\d{2}T/i.test(stripScripts(body))) problems.push("Source checked timestamp absent from server HTML");
        if (!visible.includes("Кога") || !visible.includes("Къде")) problems.push("Event facts absent from server HTML");
        // Descriptions are not guaranteed by every source; verify real text whenever the section exists.
        const detail = stripScripts(body).match(/<section\b[^>]*class=["'][^"']*city-event-description[^"']*["'][^>]*>([\s\S]*?)<\/section>/i)?.[1];
        if (detail && textOnly(detail).length <= "За събитието".length) problems.push("Empty event description section");
        eventDetail = { serverDescriptionPresent: !!detail, serverDescriptionLength: detail ? textOnly(detail).length : 0, sourceAttributionPresent: visible.includes("По програмата на") };
        const imageTag = stripScripts(body).match(/<img\b[^>]*class=["'][^"']*city-event-image[^"']*["'][^>]*>/i)?.[0];
        const imagePath = imageTag?.match(/\bsrc=["']([^"']+)["']/i)?.[1];
        if (imagePath) {
          const decoded = decode(imagePath);
          if (!decoded.startsWith("/moyat-plovdiv/event-image/?")) problems.push("Event image does not use crawlable guarded route");
          else if (expectIndexable) {
            const image = await fetch(new URL(decoded, base), { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(30_000) });
            eventDetail.imageStatus = image.status;
            if (image.status !== 200 || !image.headers.get("content-type")?.startsWith("image/webp")) problems.push("Crawlable event image is unavailable");
            if (/noindex/i.test(image.headers.get("x-robots-tag") ?? "")) problems.push("Public event image rejects indexing");
          }
        }
        if (!links(body).some(href => href === "/moyat-plovdiv/culture/" || href === "/moyat-plovdiv/nightlife/")) problems.push("No return path to agenda");
      }
    }
  }
  errors.push(...problems.map(problem => `${path}: ${problem}`));
  pages.push({ path, status: response.status, durationMs, title: seo.titles, description: seo.descriptions, canonical: seo.canonicals, robots: seo.robots, robotsHeader: response.headers.get("x-robots-tag"), h1: seo.headlines, schemaTypes: seo.jsonLdTypes, ...(eventDetail ? { eventDetail } : {}), errors: problems });
  console.log(`${path}: ${problems.length ? problems.join("; ") : "PASS"}`);
}

try {
  for (const path of ["/moyat-plovdiv/", "/moyat-plovdiv/transport/", "/moyat-plovdiv/culture/", "/moyat-plovdiv/nightlife/"]) await auditPage(path, "collection");
  await auditPage("/moyat-plovdiv/saved/", "private");
  await auditPage("/moyat-plovdiv/not-a-real-category/", "missing");
  await auditPage("/moyat-plovdiv/events/not-a-valid-event/", "missing");
  const eventPaths = [...new Set(["culture", "nightlife"].flatMap(category => links(htmlByPath.get(`/moyat-plovdiv/${category}/`) ?? "").filter(path => /^\/moyat-plovdiv\/events\/e-[A-Za-z0-9_-]+\/$/.test(path))))];
  if (!eventPaths.length) errors.push("Agenda HTML has no crawlable event link; no event detail could be verified");
  for (const path of eventPaths.slice(0, 2)) await auditPage(path, "event");

  let sitemap: Record<string, unknown> = { verified: false, reason: "Preview run does not require public discovery" };
  if (expectIndexable) {
    const index = await request("/sitemap.xml");
    if (index.response.status !== 200 || !index.body.includes(`${expectedOrigin}/sitemaps/city.xml`)) errors.push("Root sitemap does not advertise city.xml");
    const city = await request("/sitemaps/city.xml");
    const urls = [...city.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]!));
    if (city.response.status !== 200 || !urls.length) errors.push("City sitemap unavailable or empty");
    const allowedCategories = new Set(["transport", "parking", "outages", "education", "environment", "culture", "nightlife", "municipality", "adopt"]);
    for (const raw of urls) {
      try {
        const url = new URL(raw);
        const category = /^\/moyat-plovdiv\/([^/]+)\/$/.exec(url.pathname)?.[1];
        if (url.origin !== expectedOrigin || url.search || url.hash || !(url.pathname === "/moyat-plovdiv/" || category && allowedCategories.has(category) || /^\/moyat-plovdiv\/events\/e-[A-Za-z0-9_-]+\/$/.test(url.pathname))) errors.push(`Unexpected sitemap URL: ${raw}`);
      } catch { errors.push(`Invalid sitemap URL: ${raw}`); }
    }
    if (new Set(urls).size !== urls.length) errors.push("City sitemap contains duplicate URLs");
    if (!urls.includes(`${expectedOrigin}/moyat-plovdiv/`)) errors.push("City root absent from sitemap");
    if (eventPaths.length && !urls.includes(`${expectedOrigin}${eventPaths[0]}`)) errors.push("Observed agenda event absent from sitemap");
    const llms = await request("/llms.txt");
    if (llms.response.status !== 200 || !llms.body.includes(`${expectedOrigin}/moyat-plovdiv/`)) errors.push("llms.txt does not expose city landing page");
    sitemap = { status: city.response.status, indexStatus: index.response.status, count: urls.length, eventCount: urls.filter(url => url.includes("/events/")).length, urls, llmsStatus: llms.response.status };
  }
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(`${reportDir}/audit.json`, JSON.stringify({ checkedAt: new Date().toISOString(), base: base.origin, expectedOrigin, expectIndexable, pass: !errors.length, pages, sitemap, errors }, null, 2));
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else console.log("CITY_SEO_AUDIT_PASS");
} catch (error) {
  mkdirSync(reportDir, { recursive: true });
  const message = error instanceof Error ? error.message : String(error);
  writeFileSync(`${reportDir}/audit.json`, JSON.stringify({ checkedAt: new Date().toISOString(), base: base.origin, pass: false, pages, errors: [...errors, message] }, null, 2));
  console.error(`City audit stopped: ${message}`);
  process.exitCode = 1;
}
