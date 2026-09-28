import { describe, expect, it } from "vitest";
import { mediaPublicPath, newsStorageKey, resolveMediaUrl } from "./media";

describe("resolveMediaUrl", () => {
  it("returns the original WordPress URL for wordpress_origin assets", () => {
    const url = "https://newspoint.bg/wp-content/uploads/2026/09/pozhar.png";
    expect(resolveMediaUrl({ provider: "wordpress_origin", sourceUrl: url, storageKey: null }, "card")).toBe(url);
  });

  it("keeps WordPress upload folders under news/", () => {
    expect(newsStorageKey("https://newspoint.bg/wp-content/uploads/2026/09/pozhar.png")).toBe("news/2026/09/pozhar.png");
    expect(newsStorageKey("https://newspoint.bg/wp-content/uploads/../secret.png")).toBeNull();
    expect(mediaPublicPath("news/2026/09/pozhar.png")).toBe("/media/news/2026/09/pozhar.png");
  });

  it("prefers a copied file over the original WordPress URL", () => {
    const url = "https://newspoint.bg/wp-content/uploads/2026/09/pozhar.png";
    expect(resolveMediaUrl({ provider: "wordpress_origin", sourceUrl: url, storageKey: "news/2026/09/pozhar.png" })).toBe(
      "/media/news/2026/09/pozhar.png",
    );
  });

  it("fails loudly instead of rendering an empty image", () => {
    expect(() => resolveMediaUrl({ provider: "wordpress_origin", sourceUrl: null, storageKey: null })).toThrow();
    expect(() => resolveMediaUrl({ provider: "object_storage", sourceUrl: null, storageKey: "a/b.jpg" })).toThrow(
      /not configured/,
    );
  });
});
