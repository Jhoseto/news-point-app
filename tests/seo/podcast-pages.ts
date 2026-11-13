/** Read-only check of every published episode against the HTML, XML and text directories. */
import { decode, inspectSeoHtml } from "./html-audit";
import type { PublicEpisode } from "../../apps/web/lib/podcast-types";

const base = new URL(process.env.SEO_BASE_URL || "http://localhost:3000").origin;
const origin = new URL(process.env.SEO_CANONICAL_ORIGIN || base).origin;
const series = "/livepoint/podcast/";
const expectIndexable = process.argv.includes("--expect-indexable");
const failures: string[] = [];
async function read(path: string, width = 1280) {
  const res = await fetch(new URL(path, base), {
    redirect: "manual", signal: AbortSignal.timeout(60_000),
    headers: { "sec-ch-viewport-width": String(width), "user-agent": "NewsPoint-Podcast-Check/1.0" },
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status} on ${path}`);
  return { body: await res.text(), headers: res.headers };
}
function locs(xml: string) {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), match => decode(match[1]!));
}
function episodePaths(hrefs: string[]) {
  return new Set(hrefs.map(href => new URL(href, origin)).filter(url => url.origin === origin &&
    /^\/livepoint\/podcast\/[a-z0-9-]+\/$/.test(url.pathname) && !url.search && !url.hash).map(url => url.pathname));
}
function compare(label: string, paths: Set<string>, published: Set<string>) {
  const missing = [...published].filter(path => !paths.has(path));
  const extra = [...paths].filter(path => !published.has(path));
  if (missing.length || extra.length) failures.push(`${label} missing ${missing.join(" ")}; unexpected ${extra.join(" ")}`);
  console.log(`${label}: ${published.size - missing.length}/${published.size}`);
}
function normalize(value: string) { return value.trim().replace(/\s+/g, " "); }

async function run() {
  const { episodes } = JSON.parse((await read("/api/podcasts/")).body) as { episodes: PublicEpisode[] };
  const published = new Set(episodes.map(episode => episode.path));
  const hub = inspectSeoHtml((await read(series)).body);
  compare("Catalogue links", episodePaths(hub.links), published);
  if (hub.headlines.length !== 1 || hub.headlines[0] !== "Подкасти на NewsPoint") failures.push("Catalogue H1");
  const shards = locs((await read("/sitemap.xml")).body).map(url => new URL(url)).filter(url => /^\/sitemaps\/podcasts-\d+\.xml$/.test(url.pathname));
  const sitemap = new Set<string>();
  for (const shard of shards) {
    if (shard.origin !== origin) failures.push(`Sitemap origin: ${shard}`);
    for (const url of locs((await read(shard.pathname)).body)) {
      if (sitemap.has(url)) failures.push(`Duplicate sitemap URL: ${url}`);
      sitemap.add(url);
    }
  }
  compare("Podcast XML", sitemap, new Set(episodes.map(episode => origin + episode.path)));
  const directory = (await read("/llms.txt")).body;
  const textLinks = Array.from(directory.matchAll(/\]\(<([^>]+)>\)/g), match => match[1]!);
  compare("Text directory links", episodePaths(textLinks), published);
  const latest = episodes[0];
  if (latest) {
    for (const width of [390, 1280]) {
      const links = inspectSeoHtml((await read("/", width)).body).links;
      const direct = episodePaths(links).has(latest.path);
      console.log(`Homepage at ${width}px links latest: ${direct}`);
      if (!direct || !links.some(href => new URL(href, origin).href === origin + series)) failures.push(`Homepage at ${width}px`);
    }
  }
  let passed = 0;
  for (const episode of episodes) {
    const { body, headers } = await read(episode.path);
    const page = inspectSeoHtml(body);
    const [entity] = page.podcastEpisodes;
    const text = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    const paragraphs = Array.from(text.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi), match => normalize(decode(match[1]!.replace(/<[^>]*>/g, ""))));
    const indexable = ![...page.robots, headers.get("x-robots-tag") || ""].some(value => /\b(?:noindex|none)\b/i.test(value));
    const url = origin + episode.path;
    const errors = [...page.errors];
    if (page.canonicals.length !== 1 || page.canonicals[0] !== url) errors.push("canonical");
    if (page.headlines.length !== 1 || page.headlines[0] !== episode.title) errors.push("H1");
    if (!paragraphs.includes(normalize(episode.summary))) errors.push("full summary absent from HTML");
    if (page.podcastEpisodes.length !== 1 || entity?.url !== url || entity.name !== episode.title ||
      entity.publishedAt !== episode.publishedAt || entity.audioUrl !== origin + episode.audioUrl ||
      entity.seriesId !== origin + series + "#series") errors.push("episode, publication date or audio identity");
    if (expectIndexable && !indexable) errors.push("noindex");
    if (errors.length) failures.push(`${episode.path} ${errors.join(", ")}`);
    else passed++;
  }
  console.log(`Episode pages with own title, HTML summary, canonical, publication date and audio: ${passed}/${published.size}`);
}
run().catch(error => failures.push(String(error))).finally(() => {
  if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
});
