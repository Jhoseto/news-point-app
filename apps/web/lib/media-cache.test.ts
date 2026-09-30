import { describe, expect, it } from "vitest";
import { mediaCacheControl } from "./media-cache";

describe("media cache", () => {
  it("keeps a replaced original for a day and a hashed variant for a year", () => {
    expect(mediaCacheControl("news/2026/09/story.jpg")).toBe("public, max-age=86400");
    expect(mediaCacheControl(`news/2026/09/${"a".repeat(64)}.webp`)).toBe("public, max-age=31536000, immutable");
    expect(mediaCacheControl("news/2026/09/not-a-hash.webp")).toBe("public, max-age=86400");
  });
});
