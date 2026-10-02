/**
 * Trigger a Next.js on-demand revalidation on the public web app.
 *
 * Used by Studio mutations (publish, podcast, poll, page arrangement) and by the
 * live dispatcher to invalidate cache after the SSE outbox event lands. Editor
 * content drives ISR via the `Cache-Control: public, s-maxage=60, stale-while-
 * revalidate=...` headers that the public app attaches to non-private
 * responses; this call forces an immediate rebuild for the named paths.
 *
 * Single source of truth for:
 *   - the URL of the revalidate endpoint (`/api/revalidate/`)
 *   - the secret header (`x-revalidate-secret`)
 *   - the fail-soft semantics: if `REVALIDATE_SECRET` is unset or the call
 *     fails, the surrounding cache (60 s + SWR) still refreshes on its own.
 */

const REVALIDATE_PATH = "/api/revalidate/";

export interface RevalidateResult {
  triggered: boolean;
  reason: "no_secret" | "no_base_url" | "ok" | "error";
}

function readBaseUrl(): string | null {
  const raw = process.env.WEB_URL?.trim();
  return raw && raw.length > 0 ? raw : null;
}

function readSecret(): string | null {
  const raw = process.env.REVALIDATE_SECRET?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/**
 * POST `/api/revalidate/` with the given paths. Never logs the secret.
 * Returns the outcome rather than throwing — callers decide whether to retry.
 */
export async function triggerRevalidate(paths: string[]): Promise<RevalidateResult> {
  if (paths.length === 0) return { triggered: false, reason: "no_secret" };
  const secret = readSecret();
  if (!secret) return { triggered: false, reason: "no_secret" };
  const baseUrl = readBaseUrl();
  if (!baseUrl) return { triggered: false, reason: "no_base_url" };

  try {
    const response = await fetch(new URL(REVALIDATE_PATH, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ paths }),
      signal: AbortSignal.timeout(3000),
    });
    return { triggered: response.ok, reason: response.ok ? "ok" : "error" };
  } catch {
    return { triggered: false, reason: "error" };
  }
}

/** Re-export the internal pre-check for places that want to log a single warning. */
export function revalidateHasSecret(): boolean {
  return readSecret() !== null;
}