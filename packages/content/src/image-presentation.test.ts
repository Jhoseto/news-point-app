import { describe, expect, it } from "vitest";
import { focalPointSchema, imageVariantSchema, imagePresentation, responsiveImageVariants } from "./image-presentation";
import { validImageVariant, validFocalPoint } from "./image-presentation-runtime";

const source = { url: "https://newspoint.bg/wp-content/uploads/original.jpg", width: 1600, height: 900 };
const variant = { url: "https://newspoint.bg/wp-content/uploads/small.jpg", width: 640, height: 360 };
describe("public image presentation", () => {
  it("keeps lightweight browser validation equivalent to the server schemas", () => {
    const variants: unknown[] = [null, undefined, [], {}, variant, { ...variant, extra: 1 }];
    for (const width of [NaN, Infinity, -1, 0, .5, 1, 16384, 16385, "640", null]) {
      variants.push({ ...variant, width }, { ...variant, height: width });
    }
    for (const url of ["/media/news/a.webp", "/media/news/../a.webp", "https://x.test/a.webp", "http://x.test/a.webp", "https://x.test/a.webp?q=1", "https://x.test/" + "x".repeat(2048), "javascript:alert(1)", "https://u:p@x.test/a.webp"]) variants.push({ ...variant, url });
    for (const value of variants) expect(validImageVariant(value), JSON.stringify(value)).toBe(imageVariantSchema.safeParse(value).success);
    const points: unknown[] = [null, undefined, [], {}, { x: 0, y: 1 }, { x: 0, y: 1, extra: true }];
    for (const x of [NaN, Infinity, -1, 0, .5, 1, 2, "0", null]) points.push({ x, y: .5 }, { x: .5, y: x });
    for (const point of points) expect(validFocalPoint(point), JSON.stringify(point)).toBe(focalPointSchema.safeParse(point).success);
  });
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
    expect(responsiveImageVariants(new Array(2), source)).toEqual([]);
  });
  it("keeps the existing CSS position without valid editorial focus", () => {
    expect(imagePresentation({ ...source, focalPoint: { x: -1, y: 0.2 } }).objectPosition).toBeUndefined();
    expect(imagePresentation({ ...source, focalPoint: { x: 0, y: 1 } }).objectPosition).toBe("0% 100%");
    expect(focalPointSchema.safeParse({ x: NaN, y: 0 }).success).toBe(false);
  });
});
