import { describe, expect, it } from "vitest";
import { podcastSlug } from "./podcast-slug";

describe("podcast slug", () => {
  it("folds Bulgarian and keeps a unique tail", () => {
    expect(podcastSlug("Гласът на града", "ab12cd")).toBe("glasat-na-grada-ab12cd");
    expect(podcastSlug("City Desk", "AB-12")).toBe("city-desk-ab12");
    expect(podcastSlug("!!!", "")).toBe("podcast-ep");
    expect(podcastSlug("а".repeat(80), "abcdefextra")).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(podcastSlug("а".repeat(80), "abcdefextra").endsWith("-abcdef")).toBe(true);
    expect(podcastSlug("а".repeat(80), "abcdefextra").length).toBeLessThanOrEqual(80);
  });
});
