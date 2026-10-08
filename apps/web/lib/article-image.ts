import { imagePresentation } from "@newspoint/content";
import type { Media } from "@/lib/queries";

type SrcEntry = { url: string; width: number };

function parseSrcSet(srcSet: string | undefined): SrcEntry[] {
  if (!srcSet) return [];
  return srcSet
    .split(",")
    .map((part) => {
      const [url, descriptor] = part.trim().split(/\s+/);
      const width = Number.parseInt(descriptor ?? "", 10);
      return { url, width: Number.isFinite(width) ? width : Number.POSITIVE_INFINITY };
    })
    .filter((entry): entry is SrcEntry => Boolean(entry.url));
}

/** Card/list srcset: mid rungs only (never pull a 2–4k master for a 22vw tile). */
export function compactSrcSet(srcSet: string | undefined, maxWidth: number): string | undefined {
  let entries = parseSrcSet(srcSet);
  if (!entries.length) return undefined;
  const capped = entries.filter((entry) => entry.width <= maxWidth);
  if (capped.length >= 1) entries = capped;
  if (entries.length <= 3) {
    return entries.map((entry) => `${entry.url} ${entry.width}w`).join(", ");
  }
  const largest = entries[entries.length - 1]!.width;
  const targets = [320, 768, largest];
  const picked: SrcEntry[] = [];
  for (const target of targets) {
    const best = entries.reduce((a, b) => (Math.abs(b.width - target) < Math.abs(a.width - target) ? b : a));
    if (!picked.some((entry) => entry.url === best.url)) picked.push(best);
  }
  return picked
    .sort((a, b) => a.width - b.width)
    .map((entry) => `${entry.url} ${entry.width}w`)
    .join(", ");
}

/** Rough DPR-aware ceiling from the CSS `sizes` string (default `src` before srcset picks). */
export function preferWidthFromSizes(sizes: string | undefined, fallback: number): number {
  if (!sizes) return fallback;
  const px = sizes.trim().match(/^(\d+)px$/);
  if (px) return Math.min(1280, Math.max(320, Number(px[1]) * 2));
  if (/\b(22|25|33)vw\b/.test(sizes)) return 640;
  if (/\b(42|46|50)vw\b/.test(sizes)) return 960;
  // Mobile lead is height-capped (~16rem); prefer ≤800 so 768w wins over a ~824 master.
  if (sizes.includes("100vw")) return 800;
  return fallback;
}

function srcFromSet(set: string | undefined, preferMaxWidth: number, fallback: string): string {
  const entries = parseSrcSet(set);
  if (!entries.length) return fallback;
  const fit = [...entries].reverse().find((entry) => entry.width <= preferMaxWidth);
  return (fit ?? entries[0])!.url;
}

export type ArticleImageAttrs = {
  src: string;
  srcSet?: string;
  sizes?: string;
};

/** Same attrs `ArticleImage` emits — used for LCP `<link rel=preload>`. */
export function articleImageAttrs(
  media: Media,
  opts: { priority?: boolean; sizes?: string; lite?: boolean } = {},
): ArticleImageAttrs {
  const { priority = false, sizes, lite = false } = opts;
  const presentation = imagePresentation(media);
  // Mobile full-bleed leads stay ≤960; desktop priority band may use 1280.
  const maxWidth = priority ? (sizes?.includes("100vw") ? 960 : 1280) : 960;
  const srcSet = lite ? undefined : compactSrcSet(presentation.srcSet, maxWidth);
  const prefer = preferWidthFromSizes(sizes, priority ? 960 : 640);
  const src = lite
    ? srcFromSet(presentation.srcSet, Math.min(640, prefer), media.url)
    : srcFromSet(srcSet ?? presentation.srcSet, prefer, media.url);
  return {
    src,
    ...(srcSet ? { srcSet } : {}),
    ...(lite ? {} : sizes ? { sizes } : {}),
  };
}
