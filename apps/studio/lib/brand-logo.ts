/** Same assets as public web (`apps/web/public/brand`, copied on optimize). */
export const BRAND_LOGO = {
  width: 981,
  height: 278,
  src: "/brand/newspoint-logo.webp",
  srcSet: "/brand/newspoint-logo-512w.webp 512w, /brand/newspoint-logo.webp 981w",
  sizes: "(max-width: 640px) 180px, (max-width: 1280px) 220px, 248px",
  alt: "NewsPoint.bg — гласът на истината",
} as const;

export const BRAND_LOGO_DARK = {
  width: 974,
  height: 339,
  src: "/brand/newspoint-logo-dark.webp",
  srcSet: "/brand/newspoint-logo-dark-512w.webp 512w, /brand/newspoint-logo-dark.webp 974w",
} as const;
