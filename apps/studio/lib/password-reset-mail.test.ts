import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sendPasswordResetEmail } from "./password-reset-mail";

const secret = "secret-reset-token";
const url = `https://studio.test/admin/login/reset/?token=${secret}`;
let logs: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RESEND_API_KEY", "fixture-provider-key");
  logs = [vi.spyOn(console, "error").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {}), vi.spyOn(console, "info").mockImplementation(() => {})];
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
function safeLogs() {
  const output = JSON.stringify(logs.flatMap(log => log.mock.calls));
  for (const value of [secret, url, "fixture-provider-key", "editor@example.test"]) expect(output).not.toContain(value);
  return output;
}

it("handles rejected fetch without an unhandled background rejection", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error(url)); vi.stubGlobal("fetch", fetcher);
  await expect(sendPasswordResetEmail("editor@example.test", url)).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(safeLogs()).toContain("network_or_provider_error");
});

it("never reads or logs a provider error body", async () => {
  const text = vi.fn().mockRejectedValue(new Error(secret));
  const cancel = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, text, body: { cancel } }));
  await sendPasswordResetEmail("editor@example.test", url);
  expect(text).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce();
  expect(safeLogs()).toContain("http_503");
});

it("bounds stalled providers to fifteen seconds with no resend", async () => {
  vi.useFakeTimers(); let signal: AbortSignal | undefined;
  const fetcher = vi.fn((_url, init) => { signal = init.signal; return new Promise(() => {}); }); vi.stubGlobal("fetch", fetcher);
  const delivery = sendPasswordResetEmail("editor@example.test", url);
  await vi.advanceTimersByTimeAsync(15_000); await delivery;
  expect(signal?.aborted).toBe(true); expect(fetcher).toHaveBeenCalledOnce();
  expect(safeLogs()).toContain("timeout"); expect(vi.getTimerCount()).toBe(0);
});

it("does not log reset secrets in production even with development logging enabled", async () => {
  vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("STUDIO_PASSWORD_RESET_LOG", "1");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await sendPasswordResetEmail("editor@example.test", url);
  expect(fetcher).not.toHaveBeenCalled(); expect(safeLogs()).toContain("provider_not_configured");
});

it("consumes successful responses without operational errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  await sendPasswordResetEmail("editor@example.test", url);
  expect(safeLogs()).toBe("[]");
});
