import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { candidateSources } from "./catalog";

const outputDir = resolve(process.env.CITY_PILOT_OUTPUT_DIR || resolve(import.meta.dirname, "../../../../tests/reports/city-source-pilot"));
const agent = process.env.CITY_PILOT_USER_AGENT || "NewsPointCityPilot/0.1 (+https://newspoint.bg/)";

type Probe = {
  id: string;
  url: string;
  checkedAt: string;
  status?: number;
  finalUrl?: string;
  contentType?: string | null;
  contentLength?: string | null;
  etag?: string | null;
  lastModified?: string | null;
  elapsedMs: number;
  error?: string;
};

async function head(url: string): Promise<Response> {
  const sourceHost = new URL(url).hostname;
  let current = url;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(current, { method: "HEAD", headers: { "User-Agent": agent }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("redirect without Location");
    const next = new URL(location, current);
    if (next.protocol !== "https:" || next.hostname !== sourceHost) throw new Error("redirect left the source HTTPS host");
    current = next.toString();
  }
  throw new Error("too many redirects");
}

async function run(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const probes: Probe[] = [];
  const lastHostRequest = new Map<string, number>();
  for (const source of candidateSources) {
    const host = new URL(source.url).hostname;
    const delay = 1000 - (Date.now() - (lastHostRequest.get(host) ?? 0));
    if (delay > 0) await new Promise((done) => setTimeout(done, delay));
    const started = Date.now();
    lastHostRequest.set(host, started);
    const probe: Probe = { id: source.id, url: source.url, checkedAt: new Date(started).toISOString(), elapsedMs: 0 };
    try {
      const response = await head(source.url);
      Object.assign(probe, {
        status: response.status,
        finalUrl: response.url,
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      });
    } catch (error) {
      probe.error = error instanceof Error ? error.message : String(error);
    }
    probe.elapsedMs = Date.now() - started;
    probes.push(probe);
    process.stdout.write(`${source.id}: ${probe.status ?? probe.error}\n`);
  }
  await writeFile(resolve(outputDir, "catalog-http.json"), JSON.stringify({ checkedAt: new Date().toISOString(), method: "HEAD", note: "Reachability only; HEAD is not a parser or freshness validation.", probes }, null, 2) + "\n", "utf8");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
