/** Full wordmark in chrome; square mark is favicon-only (`studio-mark*.webp`). */
export const BRAND_LOGO = {
  width: 981,
  height: 278,
  src: "/brand/newspoint-logo.webp",
  srcSet: "/brand/newspoint-logo-512w.webp 512w, /brand/newspoint-logo.webp 981w",
  sizes: "(max-width: 640px) 160px, 220px",
  alt: "NewsPoint.bg",
} as const;

export const BRAND_LOGO_DARK = {
  width: BRAND_LOGO.width,
  height: BRAND_LOGO.height,
  src: "/brand/newspoint-logo-dark.webp",
  srcSet: `/brand/newspoint-logo-dark-512w.webp 512w, /brand/newspoint-logo-dark.webp ${BRAND_LOGO.width}w`,
} as const;
