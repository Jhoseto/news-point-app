import { expect, it, vi } from "vitest";
import type { ScriptDb } from "./node";
import { hasMediaPresentations } from "./media-presentation";

it("coalesces schema checks and caches absence briefly during manual rollout", async () => {
  vi.useFakeTimers();
  try {
    const execute = vi.fn().mockResolvedValue([{ available: false }]);
    const db = { execute } as unknown as Pick<ScriptDb, "execute">;
    expect(await Promise.all([hasMediaPresentations(db), hasMediaPresentations(db)])).toEqual([false, false]);
    expect(execute).toHaveBeenCalledTimes(1);
    execute.mockResolvedValue([{ available: true }]);
    vi.advanceTimersByTime(60_001);
    expect(await hasMediaPresentations(db)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});

it("does not silently turn database failures into a missing migration", async () => {
  const execute = vi.fn().mockRejectedValueOnce(new Error("DB unavailable")).mockResolvedValue([{ available: true }]);
  const db = { execute } as unknown as Pick<ScriptDb, "execute">;
  await expect(hasMediaPresentations(db)).rejects.toThrow("DB unavailable");
  expect(await hasMediaPresentations(db)).toBe(true);
});
