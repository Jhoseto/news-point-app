import { afterEach, expect, it, vi } from "vitest";
import { authFormRequest, authOperationalError, AUTH_SERVICE_ERROR } from "./auth-form-request";

afterEach(() => vi.useRealTimers());

it("releases a stalled request by aborting without retrying", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const request = vi.fn((value: AbortSignal) => { signal = value; return new Promise<never>(() => undefined); });
  const result = expect(authFormRequest(request)).rejects.toThrow("auth_request_timeout");
  await vi.advanceTimersByTimeAsync(15_000);
  await result;
  expect(signal?.aborted).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("propagates network rejection and allows a subsequent request", async () => {
  await expect(authFormRequest(async () => { throw new TypeError("Failed to fetch"); })).rejects.toThrow("Failed to fetch");
  await expect(authFormRequest(async () => ({ error: null }))).resolves.toEqual({ error: null });
});

it("clears timeout after success and preserves structured auth errors", async () => {
  vi.useFakeTimers();
  await expect(authFormRequest(async () => ({ error: { status: 503 } }))).resolves.toEqual({ error: { status: 503 } });
  expect(vi.getTimerCount()).toBe(0);
});

it("distinguishes operational failures from bad credentials or invalid token", () => {
  for (const status of [0, 408, 500, 503]) expect(authOperationalError(status)).toBe(AUTH_SERVICE_ERROR);
  expect(authOperationalError(403)).toContain("блокирана");
  for (const status of [200, 400, 401, 429]) expect(authOperationalError(status)).toBeNull();
});
