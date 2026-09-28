// Minimal client for the public WordPress REST API of newspoint.bg.
import * as dns from "node:dns";
import https from "node:https";

export interface WpCategory {
  id: number;
  name: string;
  slug: string;
  link: string;
  count: number;
}

export interface WpMedia {
  id: number;
  source_url: string;
  mime_type?: string;
  alt_text?: string;
  caption?: { rendered: string };
  media_details?: { width?: number; height?: number; sizes?: Record<string, { source_url?: string; width?: number; height?: number }> };
}

export interface WpPost {
  id: number;
  date_gmt: string;
  modified_gmt: string;
  slug: string;
  status: string;
  link: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
  categories: number[];
  featured_media: number;
  _embedded?: { "wp:featuredmedia"?: Array<WpMedia | { code: string }> };
}

const USER_AGENT = "NewsPoint2-import/0.1 (+local demo)";
const PAUSE_MS = 400;

function sourceAddress(): string {
  return process.env.WP_SOURCE_ADDRESS?.trim() ?? "";
}

function pinnedLookup(hostname: string, options: dns.LookupOptions | ((error: NodeJS.ErrnoException | null, address: string, family: number) => void), callback?: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) {
  const done = typeof options === "function" ? options : callback;
  const lookupOptions = typeof options === "function" ? {} : options;
  const address = sourceAddress();
  if (!done) return;
  if (address && (hostname === "newspoint.bg" || hostname === "www.newspoint.bg")) {
    if (lookupOptions.all) {
      (done as unknown as (error: null, addresses: Array<{ address: string; family: number }>) => void)(null, [{ address, family: 4 }]);
      return;
    }
    done(null, address, 4);
    return;
  }
  dns.lookup(hostname, lookupOptions, done);
}

type JsonResponse = {
  ok: boolean;
  status: number;
  header(name: string): string | null;
  json: () => Promise<unknown>;
};

function requestJson(url: URL): Promise<JsonResponse> {
  if (!sourceAddress()) {
    return fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }).then(async (response) => ({
      ok: response.ok,
      status: response.status,
      header: (name: string) => response.headers.get(name),
      json: () => response.json(),
    }));
  }
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        lookup: pinnedLookup,
        rejectUnauthorized: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = response.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            header: (name: string) => {
              const value = response.headers[name.toLowerCase()];
              return Array.isArray(value) ? value.join(",") : value ?? null;
            },
            json: async () => JSON.parse(body) as unknown,
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export class WpClient {
  requests = 0;

  constructor(private readonly baseUrl: string) {}

  private async get<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(`/wp-json/wp/v2/${path}`, this.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    if (this.requests > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    this.requests += 1;
    const response = await requestJson(url);
    if (!response.ok) {
      throw new Error(`GET ${url.pathname}${url.search} -> ${response.status}`);
    }
    return (await response.json()) as T;
  }

  categories(): Promise<WpCategory[]> {
    return this.get("categories", { per_page: 100, _fields: "id,name,slug,link,count" });
  }

  posts(params: Record<string, string | number>): Promise<WpPost[]> {
    return this.get("posts", { status: "publish", _embed: "wp:featuredmedia", ...params });
  }

  /** One page of published posts, plus the WordPress page count. `after` is an ISO date. */
  async postsPage(after: string, page: number): Promise<{ posts: WpPost[]; totalPages: number; total: number }> {
    const url = new URL("/wp-json/wp/v2/posts", this.baseUrl);
    const params = { status: "publish", _embed: "wp:featuredmedia", after, orderby: "date", order: "desc", per_page: 100, page };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    if (this.requests > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    this.requests += 1;
    const response = await requestJson(url);
    if (!response.ok) throw new Error(`GET ${url.pathname}${url.search} -> ${response.status}`);
    return {
      posts: (await response.json()) as WpPost[],
      totalPages: Number(response.header("x-wp-totalpages") ?? 1),
      total: Number(response.header("x-wp-total") ?? 0),
    };
  }

  media(ids: number[]): Promise<WpMedia[]> {
    return this.get("media", { include: ids.join(","), per_page: ids.length, _fields: "id,source_url,media_details" });
  }
}

export function fetchOriginBytes(target: string): Promise<Buffer | null> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return Promise.resolve(null);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = https.request(
      url,
      {
        headers: { "User-Agent": USER_AGENT, Accept: "image/*,*/*" },
        lookup: pinnedLookup,
        rejectUnauthorized: false,
      },
      (response) => {
        if ((response.statusCode ?? 0) >= 300 && (response.statusCode ?? 0) < 400 && response.headers.location) {
          response.resume();
          resolve(fetchOriginBytes(new URL(response.headers.location, url).toString()));
          return;
        }
        if ((response.statusCode ?? 0) !== 200) {
          response.resume();
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on("error", () => resolve(null));
    req.setTimeout(30_000, () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

export function featuredMedia(post: WpPost): WpMedia | null {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  return media && "source_url" in media ? media : null;
}
