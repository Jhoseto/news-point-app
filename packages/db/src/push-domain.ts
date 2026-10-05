/** Client-safe push contracts; no database, environment or server imports. */
export type PushState = { enabled: boolean; categorySlugs: string[] | null; revision: number };
export type PushProof = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushAction = "status" | "subscribe" | "preferences" | "disable" | "unsubscribe" | "test";

export function pushFilterMatches(slugs: string[] | null, legacy: string | null, articleSlug: string | null): boolean {
  if (Array.isArray(slugs)) return articleSlug !== null && slugs.includes(articleSlug);
  return legacy === null || legacy === articleSlug;
}

export function isAllowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return false;
    return ["fcm.googleapis.com", "updates.push.services.mozilla.com"].includes(url.hostname)
      || url.hostname === "web.push.apple.com"
      || url.hostname.endsWith(".push.apple.com");
  } catch { return false; }
}

export function publicPushOrigin(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || (local && url.protocol === "http:") ? url.origin : null;
  } catch { return null; }
}

export function readerNotificationUrl(path: string, origin: string): string | null {
  try {
    const url = new URL(path, origin);
    if (url.origin !== origin || url.username || url.password || /^\/(admin|api|settings)(\/|$)/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function makePushPayload(title: string, body: string, url: string, tag: string) {
  // New Apple versions can display this without executing the service worker.
  // SW also reads this format for browsers without declarative support.
  return { web_push: 8030, notification: { title: title.slice(0, 160), body: body.slice(0, 240), navigate: url,
    lang: "bg", tag, icon: "/brand/icon-192.png", badge: "/brand/push-badge.svg", silent: false, data: { url } } };
}

export function pushRetry(attempt: number, status: number | undefined, retryAfter: string | undefined, now: number, expiresAt: number) {
  if (status === 404 || status === 410) return { kind: "gone" as const };
  if (attempt >= 6 || (status !== undefined && status !== 429 && status < 500)) return { kind: "failed" as const };
  let delay = Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, attempt - 1));
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now;
    if (Number.isFinite(requested)) delay = Math.max(delay, requested);
  }
  const dueAt = now + delay;
  return dueAt >= expiresAt ? { kind: "failed" as const } : { kind: "retry" as const, dueAt };
}
