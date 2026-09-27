// Minimal client for the public WordPress REST API of newspoint.bg.

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

export class WpClient {
  requests = 0;

  constructor(private readonly baseUrl: string) {}

  private async get<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(`/wp-json/wp/v2/${path}`, this.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    if (this.requests > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    this.requests += 1;
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
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

  media(ids: number[]): Promise<WpMedia[]> {
    return this.get("media", { include: ids.join(","), per_page: ids.length, _fields: "id,source_url,media_details" });
  }
}

export function featuredMedia(post: WpPost): WpMedia | null {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  return media && "source_url" in media ? media : null;
}
