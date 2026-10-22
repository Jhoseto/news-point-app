/** Browser-safe image presentation. No editor schemas or HTML sanitizer. */
export type FocalPoint = { x: number; y: number };
export type ImageVariant = { url: string; width: number; height: number };

export function publicImageUrl(value: string): boolean {
  if (value.startsWith("/media/news/") && !value.includes("..") && !value.includes("\\") && !value.includes("?") && !value.includes("#")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      && !/[\s,]/.test(value) && !url.pathname.includes("/storage/v1/object/sign/")
      && !url.pathname.includes("/livepoint-submissions/");
  } catch { return false; }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function dimension(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 16384;
}
export function validImageVariant(value: unknown): value is ImageVariant {
  return record(value) && Object.keys(value).every(key => key === "url" || key === "width" || key === "height")
    && typeof value.url === "string" && value.url.length <= 2048 && publicImageUrl(value.url)
    && dimension(value.width) && dimension(value.height);
}
export function validFocalPoint(value: unknown): value is FocalPoint {
  return record(value) && Object.keys(value).every(key => key === "x" || key === "y")
    && typeof value.x === "number" && Number.isFinite(value.x) && value.x >= 0 && value.x <= 1
    && typeof value.y === "number" && Number.isFinite(value.y) && value.y >= 0 && value.y <= 1;
}

/** Only equal-composition images may share a width-descriptor srcset. */
export function responsiveImageVariants(input: unknown, original: { url: string; width: number | null; height: number | null }): ImageVariant[] {
  if (!Array.isArray(input) || input.length > 6 || !original.width || !original.height) return [];
  const candidates = Array.from(input);
  if (!candidates.every(validImageVariant)) return [];
  const ratio = original.width / original.height;
  const byWidth = new Map<number, ImageVariant>();
  for (const variant of candidates) {
    if (variant.width <= original.width && variant.height <= original.height
      && Math.abs(variant.width / variant.height / ratio - 1) <= 0.01) byWidth.set(variant.width, variant);
  }
  if (!byWidth.size) return [];
  const source = { url: original.url, width: original.width, height: original.height };
  if (validImageVariant(source)) byWidth.set(source.width, source);
  return [...byWidth.values()].sort((a, b) => a.width - b.width);
}

export function imagePresentation(input: { url: string; width: number | null; height: number | null; variants?: unknown; focalPoint?: unknown }) {
  const variants = responsiveImageVariants(input.variants, input);
  const focal = validFocalPoint(input.focalPoint) ? input.focalPoint : null;
  return {
    srcSet: variants.length > 1 ? variants.map(variant => `${variant.url} ${variant.width}w`).join(", ") : undefined,
    objectPosition: focal ? `${focal.x * 100}% ${focal.y * 100}%` : undefined,
  };
}
