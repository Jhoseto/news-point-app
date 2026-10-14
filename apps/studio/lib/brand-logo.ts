/** Square Koce emblem on white — copied from web brand build (`scripts/build-pwa-icons.mjs`). */
export const BRAND_LOGO = {
  width: 512,
  height: 512,
  src: "/brand/studio-mark.webp",
  srcSet: "/brand/studio-mark-512w.webp 512w, /brand/studio-mark.webp 256w",
  sizes: "64px",
  alt: "NewsPoint Studio",
} as const;

/** Same tile on dark chrome (white square mark). */
export const BRAND_LOGO_DARK = BRAND_LOGO;
