import { describe, expect, it } from "vitest";
import { CAMERA_CATALOG, getCamera, hasVerifiedLiveCamera } from "./catalog";

describe("camera catalog", () => {
  it("only contains hand-checked public entries", () => {
    expect(CAMERA_CATALOG.length).toBeGreaterThan(3);
    for (const camera of CAMERA_CATALOG) {
      expect(camera.sourceUrl.startsWith("https://")).toBe(true);
      expect(camera.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("does not claim live until a stream is verified", () => {
    expect(hasVerifiedLiveCamera()).toBe(false);
    expect(CAMERA_CATALOG.every((camera) => camera.streamStatus !== "verified" || camera.embedUrl)).toBe(true);
  });

  it("looks up by slug", () => {
    expect(getCamera("sba-omv-plovdiv")?.owner).toBe("СБА");
    expect(getCamera("missing")).toBeUndefined();
  });
});
