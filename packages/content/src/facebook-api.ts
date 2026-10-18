// Node-only Meta HTTP adapter: all errors are deliberately credential-free.
import { createHmac } from "node:crypto";

export const FACEBOOK_PERMISSIONS = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_manage_engagement"] as const;
export class FacebookError extends Error {
  constructor(readonly code: string, readonly retryable = false, readonly uncertain = false, readonly traceId: string | null = null, readonly retryAfter = 0) { super(`facebook_${code}`); }
}
export type FacebookPage = { id: string; name: string; access_token: string; tasks: string[] };
export type FacebookPost = { id: string; message?: string; created_time?: string; from?: { id: string }; permalink_url?: string; attachments?: { data: { media_type?: string; target?: { id: string } }[] } };
export type FacebookComment = { id: string; message: string; from?: { id: string }; created_time?: string };
export function facebookVersion(): string {
  const version = process.env.META_GRAPH_API_VERSION ?? "v26.0";
  if (!/^v\d+\.0$/.test(version)) throw new FacebookError("configuration");
  return version;
}
const validId = (id: string) => /^\d+(?:_\d+)?$/.test(id);
export class FacebookClient {
  constructor(private readonly token: string, private readonly send: typeof fetch = fetch) {}
  private async request<T>(path: string, method: "GET" | "POST" = "GET", params: Record<string, string> = {}, source?: Uint8Array): Promise<T> {
    if (!/^(?:me(?:\/accounts|\/permissions)?|oauth\/access_token|\d+(?:_\d+)?(?:\/(?:photos|comments))?)$/.test(path)) throw new FacebookError("invalid_path");
    const url = new URL(`https://graph.facebook.com/${facebookVersion()}/${path}`);
    const secret = process.env.META_APP_SECRET;
    const payload = { ...params, ...(secret && this.token ? { appsecret_proof: createHmac("sha256", secret).update(this.token).digest("hex") } : {}) };
    let body: FormData | URLSearchParams | undefined;
    if (method === "GET") for (const [name, value] of Object.entries(payload)) url.searchParams.set(name, value);
    else if (source) {
      body = new FormData();
      for (const [name, value] of Object.entries(payload)) body.set(name, value);
      body.set("source", new Blob([Uint8Array.from(source)], { type: "image/jpeg" }), "newspoint.jpg");
    } else body = new URLSearchParams(payload);
    const write = method === "POST" && path !== "oauth/access_token";
    try {
      const response = await this.send(url, { method, ...(body ? { body } : {}), headers: this.token ? { authorization: `Bearer ${this.token}` } : {},
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(source ? 60_000 : 20_000) });
      const raw = await response.text();
      if (raw.length > 2_000_000) throw new FacebookError("response", !write, write);
      let data: { error?: { code?: number; is_transient?: boolean; fbtrace_id?: string } };
      try { data = JSON.parse(raw); } catch { throw new FacebookError("response", !write, write); }
      if (!response.ok || data.error) {
        const code = data.error?.code;
        const auth = code === 190 || code === 10 || code === 200;
        const retryable = !auth && (response.status === 429 || response.status >= 500 || data.error?.is_transient === true || [4, 17, 32, 613].includes(code ?? 0));
        throw new FacebookError(auth ? "connection" : `api_${code ?? response.status}`, retryable, write && response.status >= 500,
          data.error?.fbtrace_id?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100) ?? null, Math.min(86400, Math.max(0, Number(response.headers.get("retry-after")) || 0)) * 1000);
      }
      return data as T;
    } catch (error) {
      if (error instanceof FacebookError) throw error;
      throw new FacebookError("transport", true, write);
    }
  }
  async page(id: string) { if (!validId(id)) throw new FacebookError("invalid_id"); return this.request<{ id: string; name: string }>(id, "GET", { fields: "id,name" }); }
  async uploadPhoto(page: string, text: string, bytes: Uint8Array) {
    if (!validId(page)) throw new FacebookError("invalid_id");
    const result = await this.request<{ id?: string; post_id?: string }>(`${page}/photos`, "POST", { message: text, published: "true" }, bytes);
    if (!result.id || !validId(result.id)) throw new FacebookError("response", false, true);
    return { photoId: result.id, postId: result.post_id && validId(result.post_id) ? result.post_id : null };
  }
  async photoPost(id: string) {
    if (!validId(id)) throw new FacebookError("invalid_id");
    const photo = await this.request<{ page_story_id?: string }>(id, "GET", { fields: "page_story_id" });
    return photo.page_story_id && validId(photo.page_story_id) ? photo.page_story_id : null;
  }
  async comment(post: string, message: string) {
    if (!validId(post)) throw new FacebookError("invalid_id");
    const result = await this.request<{ id?: string }>(`${post}/comments`, "POST", { message });
    if (!result.id || !validId(result.id)) throw new FacebookError("response", false, true);
    return result.id;
  }
  async post(id: string) {
    if (!validId(id)) throw new FacebookError("invalid_id");
    return this.request<FacebookPost>(id, "GET", { fields: "id,message,created_time,from,permalink_url,attachments{media_type,target}" });
  }
  private async list<T>(path: string, fields: string, extra: Record<string, string> = {}): Promise<T[]> {
    const rows: T[] = []; let after = "";
    for (let page = 0; page < 10; page++) {
      const result = await this.request<{ data: T[]; paging?: { next?: string; cursors?: { after?: string } } }>(path, "GET", { fields, limit: "100", ...extra, ...(after ? { after } : {}) });
      if (!Array.isArray(result.data)) throw new FacebookError("response");
      rows.push(...result.data);
      if (!result.paging?.next || !result.paging.cursors?.after) return rows;
      after = result.paging.cursors.after;
    }
    throw new FacebookError("pagination_limit"); // A partial list cannot establish absence.
  }
  pages() { return this.list<FacebookPage>("me/accounts", "id,name,access_token,tasks"); }
  me() { return this.request<{ id: string }>("me", "GET", { fields: "id" }); }
  permissions() { return this.list<{ permission: string; status: string }>("me/permissions", "permission,status"); }
  comments(id: string) {
    if (!validId(id)) throw new FacebookError("invalid_id");
    return this.list<FacebookComment>(`${id}/comments`, "id,message,from,created_time", { filter: "stream" });
  }
  exchangeCode(code: string, redirectUri: string) {
    return this.request<{ access_token: string }>("oauth/access_token", "POST", { client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "", redirect_uri: redirectUri, code });
  }
  exchangeLongLived(token: string) {
    return this.request<{ access_token: string }>("oauth/access_token", "POST", { grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "", fb_exchange_token: token });
  }
}
export function facebookPermalink(value: string | undefined): string | null {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && ["www.facebook.com", "facebook.com"].includes(url.hostname) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
