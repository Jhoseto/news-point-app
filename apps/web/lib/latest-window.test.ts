import { describe, expect, it } from "vitest";
import { chronologicalLatest, inLatestWindow, LATEST_WINDOW_MS, nextLatestExpiryMs } from "./latest-window";

const nowMs = Date.parse("2026-09-25T19:00:00Z");
const article = (id: string, publishedMs: number) => ({ id, publishedAt: new Date(publishedMs) });

describe("latest 24-hour window", () => {
  it("keeps every article inside the window and excludes the exact boundary and future dates", () => {
    const rows = [
      article("fresh", nowMs - 1000),
      article("inside", nowMs - LATEST_WINDOW_MS + 1000),
      article("boundary", nowMs - LATEST_WINDOW_MS),
      article("old", nowMs - LATEST_WINDOW_MS - 1000),
      article("future", nowMs + 1000),
    ];
    expect(inLatestWindow(rows, nowMs).map((row) => row.id)).toEqual(["fresh", "inside"]);
  });

  it("orders the window from newest to oldest and keeps the newest when capped", () => {
    const rows = [
      article("noon", nowMs - 3 * 60 * 60 * 1000),
      article("fresh", nowMs - 1000),
      article("fresh", nowMs - 1000),
      article("dawn", nowMs - 20 * 60 * 60 * 1000),
      article("old", nowMs - LATEST_WINDOW_MS - 1000),
    ];
    expect(chronologicalLatest(rows, nowMs).map((row) => row.id)).toEqual(["fresh", "noon", "dawn"]);
    expect(chronologicalLatest(rows, nowMs, 2).map((row) => row.id)).toEqual(["fresh", "noon"]);
  });

  it("schedules the next expiry without polling every minute", () => {
    const rows = [article("later", nowMs - 60_000), article("next", nowMs - LATEST_WINDOW_MS + 2000)];
    expect(nextLatestExpiryMs(rows, nowMs)).toBe(2020);
    expect(nextLatestExpiryMs([], nowMs)).toBeNull();
  });
});
