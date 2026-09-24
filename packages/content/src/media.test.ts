import { describe, expect, it } from "vitest";
import { resolveMediaUrl } from "./media";

describe("resolveMediaUrl", () => {
  it("returns the original WordPress URL for wordpress_origin assets", () => {
    const url = "https://newspoint.bg/wp-content/uploads/2026/09/pozhar.png";
    expect(resolveMediaUrl({ provider: "wordpress_origin", sourceUrl: url, storageKey: null }, "card")).toBe(url);
  });

  it("fails loudly instead of rendering an empty image", () => {
    expect(() => resolveMediaUrl({ provider: "wordpress_origin", sourceUrl: null, storageKey: null })).toThrow();
    expect(() => resolveMediaUrl({ provider: "object_storage", sourceUrl: null, storageKey: "a/b.jpg" })).toThrow(
      /not configured/,
    );
  });
});
