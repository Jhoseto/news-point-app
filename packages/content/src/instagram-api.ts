import { socialOrigin } from "./social-publishing";
export function instagramConfiguration() {
    const webhook = process.env.MAKE_INSTAGRAM_WEBHOOK_URL?.trim();
    const apiKey = process.env.MAKE_INSTAGRAM_WEBHOOK_API_KEY?.trim();
    const accountId = process.env.MAKE_INSTAGRAM_ACCOUNT_ID?.trim();
    const username = process.env.MAKE_INSTAGRAM_USERNAME?.trim();
    if (!webhook || !apiKey || !/^\d+$/.test(accountId ?? "") || !/^[a-zA-Z0-9_.]{1,30}$/.test(username ?? ""))
        return null;
    try {
        const u = new URL(webhook);
        if (u.protocol !== "https:" || !/^hook\.(?:eu\d+|us\d+)\.make\.com$/.test(u.hostname) || u.username || u.password || u.search || u.hash)
            return null;
        return { webhook, apiKey, accountId: accountId!, username: username! };
    }
    catch {
        return null;
    }
}
export function instagramPermalink(value: unknown): string | null {
    if (typeof value !== "string")
        return null;
    try {
        const u = new URL(value);
        return u.protocol === "https:" && ["instagram.com", "www.instagram.com"].includes(u.hostname)
            && !u.username && !u.password && /^\/p\/[\w-]+\/?$/.test(u.pathname) && !u.search && !u.hash ? u.href : null;
    }
    catch {
        return null;
    }
}
export class InstagramError extends Error {
    constructor(public readonly code: string, public readonly retryable = false, public readonly uncertain = false, public readonly retryAfter = 0) { super(code); }
}
/** Make owns Instagram consent; never expose its webhook/key to Studio clients. */
export class InstagramClient {
    constructor(private readonly config: NonNullable<ReturnType<typeof instagramConfiguration>>, private readonly send: typeof fetch = fetch) { }
    async publish(input: {
        jobId: string;
        accountId: string;
        caption: string;
        imageUrl: string;
    }): Promise<{
        postId: string;
        permalink: string;
    }> {
        if (input.accountId !== this.config.accountId)
            throw new InstagramError("connection");
        let u: URL;
        try {
            u = new URL(input.imageUrl);
        }
        catch {
            throw new InstagramError("image");
        }
        if (!socialOrigin(u.origin) || u.username || u.password || u.search || u.hash || !/^\/media\/news\/social-instagram\/[a-f0-9-]{36}-[a-f0-9]{64}\.jpg$/.test(u.pathname))
            throw new InstagramError("image");
        if (!input.caption.trim() || input.caption.length > 2200)
            throw new InstagramError("text");
        let response: Response;
        try {
            response = await this.send(this.config.webhook, { method: "POST", headers: { "content-type": "application/json", "x-make-apikey": this.config.apiKey },
                body: JSON.stringify({ action: "publish", ...input }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(120000) });
        }
        catch {
            throw new InstagramError("lost_response", false, true);
        }
        // A non-JSON/oversized/lost response can follow a successful external publication.
        let value: Record<string, unknown>;
        try {
            const reader = response.body?.getReader();
            if (!reader)
                throw new Error();
            let bytes = 0;
            const chunks: Uint8Array[] = [];
            try {
                while (true) {
                    const part = await reader.read();
                    if (part.done)
                        break;
                    bytes += part.value.byteLength;
                    if (bytes > 65536)
                        throw new Error();
                    chunks.push(part.value);
                }
            }
            finally {
                await reader.cancel().catch(() => undefined);
            }
            value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!value || typeof value !== "object" || Array.isArray(value))
                throw new Error();
        }
        catch {
            throw new InstagramError("invalid_response", false, true);
        }
        if (!response.ok || value.ok !== true) {
            const safe = value.stage === "before_publish" && value.postId == null;
            const code = typeof value.code === "string" && /^[a-z_]{1,40}$/.test(value.code) ? value.code : "provider";
            const delay = Number(response.headers.get("retry-after"));
            throw new InstagramError(code, safe && (value.retryable === true || response.status === 429 || response.status >= 500), !safe, Number.isFinite(delay) && delay > 0 ? Math.min(delay * 1000, 86400000) : 0);
        }
        const permalink = instagramPermalink(value.permalink);
        if (typeof value.postId !== "string" || !/^\d+$/.test(value.postId) || !permalink || value.accountId !== input.accountId)
            throw new InstagramError("invalid_response", false, true);
        return { postId: value.postId, permalink };
    }
}
