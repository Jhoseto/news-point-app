/** Bound auth UI requests even if the connection never finishes. Never retry a mutation. */
export async function authFormRequest<T>(request: (signal: AbortSignal) => Promise<T>, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => request(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("auth_request_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export const AUTH_CONNECTION_ERROR = "Няма връзка със Studio или заявката се забави. Проверете връзката и опитайте отново.";
export const AUTH_SERVICE_ERROR = "Studio временно не може да изпълни заявката. Опитайте отново.";

export function authOperationalError(status: number): string | null {
  if (status === 403) return "Заявката беше блокирана. Отворете входа отново и опитайте пак.";
  if (status === 0 || status === 408 || status >= 500) return AUTH_SERVICE_ERROR;
  return null;
}
