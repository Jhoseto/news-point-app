import { withBase } from "./paths";

/** A failed network or service probe is not proof that a session was revoked. */
export async function studioSessionEnded(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetcher(withBase("/api/auth/get-session"), {
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401) return true;
    if (!response.ok) return false;
    const result = await response.json() as { session?: unknown } | null;
    return !result?.session;
  } catch {
    return false;
  }
}
