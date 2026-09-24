import { withBase } from "./paths";

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError };

/** JSON call to a Studio API route; `path` is relative to the Studio base path. */
export async function callApi<T>(method: "POST" | "PATCH" | "DELETE", path: string, body: unknown = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch(withBase(path), {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: ApiError } & T;
    if (response.ok) return { ok: true, data: payload };
    return { ok: false, status: response.status, error: payload.error ?? { code: "unknown", message: "Нещо се обърка." } };
  } catch {
    return { ok: false, status: 0, error: { code: "network", message: "Няма връзка със сървъра. Промените ви са запазени тук; опитайте отново." } };
  }
}
