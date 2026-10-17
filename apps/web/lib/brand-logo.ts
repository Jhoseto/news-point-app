import { BRAND_ASSET_VERSION } from "./brand-asset-version";

/** Bust CDN/browser/SW caches when brand scripts regenerate assets. */
export function brandAssetUrl(path: string): string {
  return `${path}?v=${BRAND_ASSET_VERSION}`;
}

/** Optimized premium logo (`scripts/optimize-brand-logo.mjs`). */
export const BRAND_LOGO = {
  width: 981,
  height: 278,
  src: brandAssetUrl("/brand/newspoint-logo.webp"),
  srcSet: `${brandAssetUrl("/brand/newspoint-logo-512w.webp")} 512w, ${brandAssetUrl("/brand/newspoint-logo.webp")} 981w`,
  sizes: "(max-width: 640px) 180px, (max-width: 1280px) 220px, 248px",
  alt: "NewsPoint.bg — гласът на истината",
} as const;

/** Dark-mode wordmark. Same slots as `BRAND_LOGO`; light mode keeps the original. */
export const BRAND_LOGO_DARK = {
  width: BRAND_LOGO.width,
  height: BRAND_LOGO.height,
  src: brandAssetUrl("/brand/newspoint-logo-dark.webp"),
  srcSet: `${brandAssetUrl("/brand/newspoint-logo-dark-512w.webp")} 512w, ${brandAssetUrl("/brand/newspoint-logo-dark.webp")} ${BRAND_LOGO.width}w`,
} as const;

export const BRAND_MARK_EMBLEM = brandAssetUrl("/brand/mark-emblem.webp");
