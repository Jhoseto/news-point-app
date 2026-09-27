/** Optimized premium logo (`scripts/optimize-brand-logo.mjs`). */
export const BRAND_LOGO = {
  width: 980,
  height: 312,
  src: "/brand/newspoint-logo.webp",
  srcSet: "/brand/newspoint-logo-512w.webp 512w, /brand/newspoint-logo.webp 980w",
  /** Matches header/footer logo heights. */
  sizes: "(max-width: 640px) 180px, (max-width: 1280px) 220px, 248px",
} as const;
