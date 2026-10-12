const READ_SESSION_PREFIX = "np-read:v1";

function countedKey(articleId: string) {
  return `${READ_SESSION_PREFIX}:counted:${articleId}`;
}

function leftKey(articleId: string) {
  return `${READ_SESSION_PREFIX}:left:${articleId}`;
}

/** One counted view per tab session until the reader opens another route and returns. */
export function shouldSendArticleRead(articleId: string, storage: Pick<Storage, "getItem">) {
  if (isArticleReadRevisit(articleId, storage)) return true;
  return storage.getItem(countedKey(articleId)) !== "1";
}

export function isArticleReadRevisit(articleId: string, storage: Pick<Storage, "getItem">) {
  return storage.getItem(leftKey(articleId)) === "1";
}

export function markArticleReadCounted(articleId: string, storage: Pick<Storage, "setItem" | "removeItem">) {
  storage.setItem(countedKey(articleId), "1");
  storage.removeItem(leftKey(articleId));
}

/** Call when the SPA route changes so a later return can count again (not on F5). */
export function markArticleReadsEligibleAfterNavigation(storage: Storage) {
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(`${READ_SESSION_PREFIX}:counted:`)) continue;
    if (storage.getItem(key) !== "1") continue;
    const articleId = key.slice(`${READ_SESSION_PREFIX}:counted:`.length);
    storage.setItem(leftKey(articleId), "1");
  }
}

export function articleReadRequestBody(revisit: boolean) {
  return revisit ? JSON.stringify({ revisit: true }) : "{}";
}

const readsInFlight = new Map<string, Promise<number | null>>();

/** One network count per open. React's dev remount shares the same request instead of adding a second view. */
export function shareArticleRead(articleId: string, send: () => Promise<number | null>): Promise<number | null> {
  const current = readsInFlight.get(articleId);
  if (current) return current;
  const pending = send().finally(() => {
    if (readsInFlight.get(articleId) === pending) readsInFlight.delete(articleId);
  });
  readsInFlight.set(articleId, pending);
  return pending;
}

function headerToken(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

/** Accepts the browser host, not Next's internal origin. localhost and 127.0.0.1 must both count. */
export function isArticleReadSameOrigin(headers: {
  origin: string | null;
  host: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
  fetchSite: string | null;
}): boolean {
  if (headers.fetchSite === "cross-site" || !headers.origin) return false;
  let sent: URL;
  try {
    sent = new URL(headers.origin);
  } catch {
    return false;
  }
  if ((sent.protocol !== "http:" && sent.protocol !== "https:") || sent.username || sent.password) return false;
  const hosts = [headers.host, headers.forwardedHost].map(headerToken).filter((value) => value.length > 0);
  if (!hosts.includes(sent.host)) return false;
  const proto = headerToken(headers.forwardedProto);
  return !proto || sent.protocol === `${proto}:`;
}
