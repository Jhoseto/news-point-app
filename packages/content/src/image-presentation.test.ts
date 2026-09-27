import { describe, expect, it } from "vitest";
import { focalPointSchema, imagePresentation, responsiveImageVariants } from "./image-presentation";

const source = { url: "https://newspoint.bg/wp-content/uploads/original.jpg", width: 1600, height: 900 };
const variant = { url: "https://newspoint.bg/wp-content/uploads/small.jpg", width: 640, height: 360 };
describe("public image presentation", () => {
  it("preserves the original fallback without metadata", () => {
    expect(imagePresentation(source)).toEqual({ srcSet: undefined, objectPosition: undefined });
  });
  it("deduplicates widths and includes the known original", () => {
    expect(responsiveImageVariants([variant, variant], source).map(item => item.width)).toEqual([640, 1600]);
    expect(imagePresentation({ ...source, variants: [variant] }).srcSet).toBe(`${variant.url} 640w, ${source.url} 1600w`);
  });
  it("excludes a differently cropped photo and oversized variants", () => {
    expect(responsiveImageVariants([{ ...variant, height: 640 }, { ...variant, width: 3200, height: 1800 }], source)).toEqual([]);
  });
  it("ignores invalid or private URLs rather than exposing them in srcset", () => {
    for (const url of ["javascript:alert(1)", "https://user:password@example.org/a.jpg", "https://x.test/a,b.jpg", "https://x.test/a.jpg?token=secret", "https://x.test/storage/v1/object/public/livepoint-submissions/a.webp"]) {
      expect(imagePresentation({ ...source, variants: [{ ...variant, url }] }).srcSet).toBeUndefined();
    }
  });
  it("rejects an unbounded candidate list", () => {
    expect(responsiveImageVariants(Array(7).fill(variant), source)).toEqual([]);
  });
  it("keeps the existing CSS position without valid editorial focus", () => {
    expect(imagePresentation({ ...source, focalPoint: { x: -1, y: 0.2 } }).objectPosition).toBeUndefined();
    expect(imagePresentation({ ...source, focalPoint: { x: 0, y: 1 } }).objectPosition).toBe("0% 100%");
    expect(focalPointSchema.safeParse({ x: NaN, y: 0 }).success).toBe(false);
  });
});
