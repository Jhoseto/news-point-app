import { describe, expect, it } from "vitest";
import { eventSaveKey, parseSavedEvents, toggleSavedEvent } from "./saved-events";

describe("device saved city events", () => {
  it("recovers from corrupt storage and keeps only recognised category identities", () => {
    expect(parseSavedEvents("broken")).toEqual([]);
    expect(parseSavedEvents('{"culture|id":true}')).toEqual([]);
    expect(parseSavedEvents(JSON.stringify(["culture|opera:1", "culture|opera:1", "nightlife|venue:2", "transport|1", null, "/external", "culture|bad id"]))).toEqual(["culture|opera:1", "nightlife|venue:2"]);
  });
  it("toggles independently across categories and bounds device storage", () => {
    const key = eventSaveKey("culture", "stage:1");
    expect(toggleSavedEvent([], key)).toEqual([key]);
    expect(toggleSavedEvent([key, "nightlife|stage:1"], key)).toEqual(["nightlife|stage:1"]);
    const full = Array.from({ length: 100 }, (_, i) => `culture|stage:${i}`);
    const next = toggleSavedEvent(full, "nightlife|new:1");
    expect(next).toHaveLength(100); expect(next[0]).toBe("nightlife|new:1");
  });
});
