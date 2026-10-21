import { describe, expect, it } from "vitest";
import { resolveFirstPublishedAt, ScheduledPublishConflictError } from "./publish-at";

describe("resolveFirstPublishedAt", () => {
  it("uses server now when no schedule is set", () => {
    const now = new Date("2026-10-21T12:00:00.000Z");
    expect(resolveFirstPublishedAt({ scheduledPublishAt: null }, now)).toBe(now);
  });

  it("uses a past scheduled instant for backdating", () => {
    const past = new Date("2026-10-20T08:00:00.000Z");
    const now = new Date("2026-10-21T12:00:00.000Z");
    expect(resolveFirstPublishedAt({ scheduledPublishAt: past }, now)).toBe(past);
  });

  it("rejects manual publish while the schedule is still in the future", () => {
    const future = new Date("2026-10-22T08:00:00.000Z");
    const now = new Date("2026-10-21T12:00:00.000Z");
    expect(() => resolveFirstPublishedAt({ scheduledPublishAt: future }, now)).toThrow(ScheduledPublishConflictError);
  });
});
