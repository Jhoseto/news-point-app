/** Inlined in <head> so Manrope is not a separate render-blocking stylesheet. */
export const MANROPE_FACE_CSS = `/* Bulgarian site: Cyrillic + Latin only. font-display: optional so Slow 4G
   does not block FCP/LCP on the font file (system UI until the face is ready). */
@font-face {
  font-family: "Manrope Variable";
  font-style: normal;
  font-display: optional;
  font-weight: 200 800;
  src: url("/fonts/manrope-cyrillic.woff2") format("woff2-variations");
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
@font-face {
  font-family: "Manrope Variable";
  font-style: normal;
  font-display: optional;
  font-weight: 200 800;
  src: url("/fonts/manrope-latin.woff2") format("woff2-variations");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}`;
