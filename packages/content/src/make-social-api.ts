const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const ID = /^\d+(?:_\d+)?$/;

export type MakeSocialSuccess = {
  ok: true;
  postId: string;
  commentId: string;
  permalink?: string;
};

export class MakeSocialError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable = false,
    public readonly uncertain = false,
    public readonly postId: string | null = null,
    public readonly traceId: string | null = null,
    public readonly retryAfter = 0,
  ) { super(code); }
}

export function usesMakeSocialProvider(): boolean {
  return process.env.SOCIAL_PUBLISHING_PROVIDER === "make";
}

export function makeSocialConfiguration() {
  if (!usesMakeSocialProvider()) return null;
  const webhook = process.env.MAKE_SOCIAL_WEBHOOK_URL?.trim();
  const apiKey = process.env.MAKE_SOCIAL_WEBHOOK_API_KEY?.trim();
  const pageId = process.env.MAKE_FACEBOOK_PAGE_ID?.trim();
  const pageName = process.env.MAKE_FACEBOOK_PAGE_NAME?.trim();
  if (!webhook || !apiKey || !pageId || !pageName || !ID.test(pageId)) return null;
  let url: URL;
  try { url = new URL(webhook); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
  return { webhook: url.href, apiKey, pageId, pageName };
}

function cleanId(value: unknown): string | null {
  const id = typeof value === "string" ? value : null;
  return id && ID.test(id) ? id : null;
}

function safePermalink(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)facebook\.com$/i.test(url.hostname) ? url.href : undefined;
  } catch { return undefined; }
}

function retryAfter(response: Response): number {
  const raw = Number(response.headers.get("retry-after"));
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw * 1000, 86_400_000) : 0;
}

export class MakeSocialClient {
  constructor(
    private readonly webhook: string,
    private readonly apiKey: string,
    private readonly send: typeof fetch = fetch,
  ) {}

  static configured(send: typeof fetch = fetch): MakeSocialClient {
    const config = makeSocialConfiguration();
    if (!config) throw new MakeSocialError("connection");
    return new MakeSocialClient(config.webhook, config.apiKey, send);
  }

  publish(input: { jobId: string; message: string; articleUrl: string; photo: Buffer }): Promise<MakeSocialSuccess> {
    if (!input.photo.length || input.photo.length > MAX_PHOTO_BYTES) throw new MakeSocialError("image");
    return this.request("publish", input);
  }

  comment(input: { jobId: string; articleUrl: string; postId: string }): Promise<MakeSocialSuccess> {
    if (!ID.test(input.postId)) throw new MakeSocialError("review");
    return this.request("comment", input);
  }

  private async request(action: "publish" | "comment", input: { jobId: string; articleUrl: string; message?: string; photo?: Buffer; postId?: string }): Promise<MakeSocialSuccess> {
    const body = new FormData();
    body.set("action", action);
    body.set("jobId", input.jobId);
    body.set("articleUrl", input.articleUrl);
    if (input.message !== undefined) body.set("message", input.message);
    if (input.postId) body.set("postId", input.postId);
    if (input.photo) body.set("photo", new Blob([Uint8Array.from(input.photo)], { type: "image/jpeg" }), `${input.jobId}.jpg`);
    let response: Response;
    try {
      response = await this.send(this.webhook, {
        method: "POST",
        headers: { "x-make-apikey": this.apiKey },
        body,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new MakeSocialError("lost_response", true, true);
    }
    const text = await response.text().catch(() => "");
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new MakeSocialError("invalid_response", false, action === "publish");
    let value: Record<string, unknown> = {};
    try { value = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { throw new MakeSocialError("invalid_response", false, action === "publish"); }
    const postId = cleanId(value.postId);
    const traceId = typeof value.traceId === "string" && value.traceId.length <= 200 ? value.traceId : null;
    if (!response.ok || value.ok !== true) {
      const stage = value.stage;
      const code = typeof value.code === "string" && /^[a-z0-9_]{1,64}$/i.test(value.code) ? value.code : response.status === 429 ? "rate_limit" : "provider";
      const safelyBeforePublish = action === "publish" && stage === "before_publish";
      const retryable = value.retryable === true || response.status === 429 || response.status >= 500;
      throw new MakeSocialError(code, retryable, action === "publish" && !safelyBeforePublish && !postId, postId, traceId, retryAfter(response));
    }
    const commentId = cleanId(value.commentId);
    if (!postId || !commentId) throw new MakeSocialError("invalid_response", false, action === "publish" && !postId, postId, traceId);
    const permalink = safePermalink(value.permalink);
    return { ok: true, postId, commentId, ...(permalink ? { permalink } : {}) };
  }
}

export const MAKE_SOCIAL_MAX_PHOTO_BYTES = MAX_PHOTO_BYTES;
