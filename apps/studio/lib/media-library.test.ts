import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { libraryImageUrl, mediaFolder } from "./media-library";

it("allows only news year and month folders", () => {
  expect(mediaFolder("news/2026")).toBe("news/2026");
  expect(mediaFolder("news/2026/09")).toBe("news/2026/09");
  expect(mediaFolder("/news/2026/09/")).toBe("news/2026/09");
  expect(mediaFolder("news/2026/13")).toBeNull();
  expect(mediaFolder("news/../etc")).toBeNull();
  expect(mediaFolder("users/profiles")).toBeNull();
});

it("points library photos at the public site, not at Studio", () => {
  expect(libraryImageUrl("news/2026/09/zholej.webp", null)).toBe("/media/news/2026/09/zholej.webp");
});
