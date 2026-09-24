import { describe, expect, it } from "vitest";
import { detectChange } from "./persist";
import { CURSOR_OVERLAP_MS, syncCursor } from "./sync";

describe("syncCursor", () => {
  it("is UTC with an explicit Z and a small overlap", () => {
    const latest = new Date("2026-09-24T06:05:03Z");
    expect(syncCursor(latest)).toBe(new Date(latest.getTime() - CURSOR_OVERLAP_MS).toISOString().replace(".000Z", "Z"));
    expect(syncCursor(latest)).toBe("2026-09-24T06:04:03Z");
  });

  it("starts one day back on an empty database", () => {
    expect(syncCursor(null, new Date("2026-09-24T06:00:00Z"))).toBe("2026-09-23T05:59:00Z");
  });
});

describe("detectChange", () => {
  const at = new Date("2026-09-24T06:05:03Z");

  it("reports new articles as created", () => {
    expect(detectChange(undefined, { sourceModifiedAt: at })).toBe("created");
  });

  it("skips articles WordPress has not modified", () => {
    expect(detectChange({ sourceModifiedAt: new Date(at) }, { sourceModifiedAt: at })).toBe("unchanged");
  });

  it("reports a newer modification time as updated", () => {
    expect(detectChange({ sourceModifiedAt: at }, { sourceModifiedAt: new Date(at.getTime() + 1000) })).toBe("updated");
  });
});
