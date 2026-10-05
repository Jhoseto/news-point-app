/** Optimized premium logo (`scripts/optimize-brand-logo.mjs`). */
export const BRAND_LOGO = {
  width: 983,
  height: 309,
  src: "/brand/newspoint-logo.webp",
  srcSet: "/brand/newspoint-logo-512w.webp 512w, /brand/newspoint-logo.webp 983w",
  sizes: "(max-width: 640px) 180px, (max-width: 1280px) 220px, 248px",
  alt: "NewsPoint.bg — гласът на истината",
} as const;

/** Dark-mode wordmark. Same slots as `BRAND_LOGO`; light mode keeps the original. */
export const BRAND_LOGO_DARK = {
  width: 985,
  height: 309,
  src: "/brand/newspoint-logo-dark.webp",
  srcSet: "/brand/newspoint-logo-dark-512w.webp 512w, /brand/newspoint-logo-dark.webp 985w",
} as const;
