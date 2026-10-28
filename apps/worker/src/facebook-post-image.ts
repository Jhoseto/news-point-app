import { resolve } from "node:path";
import sharp from "sharp";

export const FACEBOOK_IMAGE_SIZE = { width: 1200, height: 900 } as const;
const fontfile = resolve(import.meta.dirname, "../assets/social/Manrope.ttf");
const headlineFontfile = resolve(import.meta.dirname, "../assets/social/Montserrat.ttf");
const logoFile = resolve(import.meta.dirname, "../../web/public/brand/newspoint-logo-dark.webp");
const escapeMarkup = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const cleanTitle = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

async function lettering(value: string, size: number, width: number) {
  return sharp({ text: {
    text: `<span foreground="#ffffff">${escapeMarkup(value)}</span>`,
    font: `Manrope Bold ${size}`, fontfile, width, dpi: 72,
    rgba: true, wrap: "word-char", spacing: 6,
  } }).png().toBuffer({ resolveWithObject: true });
}

/** Localised Bulgarian letterforms and compact leading, independent of OS fonts. */
export async function facebookHeadline(value: string) {
  const title = cleanTitle(value);
  if (!title || title.length > 1000) throw new Error("invalid_social_headline");
  const draw = (size: number, width: number) => sharp({ text: {
    text: `<span foreground="#ffffff" weight="600" lang="bg" line_height="0.96" letter_spacing="-140">${escapeMarkup(title)}</span>`,
    font: `Montserrat ${size}`, fontfile: headlineFontfile,
    width, dpi: 72, rgba: true, wrap: "word-char", spacing: 0,
  } }).png().toBuffer({ resolveWithObject: true });
  for (let size = 44; size >= 26; size -= 2) {
    let result = await draw(size, 1096);
    if (result.info.height > 216) continue;
    // Balance the block without inserting arbitrary line breaks or adding another row.
    if (result.info.height > size * 1.7) {
      const sameRowsHeight = Math.min(216, result.info.height + 8);
      for (let width = 1064; width >= 792; width -= 32) {
        const candidate = await draw(size, width);
        if (candidate.info.height > sameRowsHeight) break;
        result = candidate;
      }
    }
    return result;
  }
  throw new Error("social_headline_does_not_fit");
}

// Fixed brand assets are rasterised once per worker, never fetched over HTTP.
let footerAssets: Promise<{ logo: Buffer; label: Buffer; labelHeight: number }> | undefined;
let instagramFooterAssets: typeof footerAssets;
function footer(instagram = false) {
  if (instagram) return instagramFooterAssets ??= Promise.all([
    sharp(logoFile).resize({ width: 260 }).png().toBuffer(), lettering("newspoint.bg", 26, 282),
  ]).then(([logo, label]) => ({ logo, label: label.data, labelHeight: label.info.height }));
  return footerAssets ??= Promise.all([
    sharp(logoFile).resize({ width: 260 }).png().toBuffer(),
    lettering("Линк в коментарите", 26, 282),
  ]).then(([logo, label]) => ({ logo, label: label.data, labelHeight: label.info.height }));
}

const surfaces = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#060b20" stop-opacity="0"/>
      <stop offset=".38" stop-color="#060b20" stop-opacity=".5"/>
      <stop offset=".72" stop-color="#060b20" stop-opacity=".94"/>
      <stop offset="1" stop-color="#060b20"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#ffffff" stop-opacity=".13"/>
      <stop offset="1" stop-color="#b6baff" stop-opacity=".035"/>
    </linearGradient>
  </defs>
  <rect y="250" width="1200" height="650" fill="url(#shade)"/>
  <path d="M52 780H1148" stroke="#ffffff" stroke-opacity=".2"/>
  <rect x="792" y="812" width="356" height="58" rx="18" fill="url(#glass)" stroke="#ffffff" stroke-opacity=".22"/>
  <g transform="translate(812 829)" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13a5 5 0 0 0 7 .2l4-4a5 5 0 0 0-7-7l-2.3 2.3M14 11a5 5 0 0 0-7-.2l-4 4a5 5 0 0 0 7 7l2.3-2.3"/>
  </g>
</svg>`);

/** A derived social image only: originals and already-checkpointed uploads stay untouched. */
export async function renderFacebookPostImage(source: Buffer, headline: string): Promise<Buffer> {
  return renderPostImage(source, headline, false);
}
/** Instagram keeps the brand but does not promise a clickable comment link. */
export async function renderInstagramPostImage(source: Buffer, headline: string): Promise<Buffer> {
  return sharp(await renderPostImage(source, headline, true)).resize(1080, 810).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
async function renderPostImage(source: Buffer, headline: string, instagram: boolean): Promise<Buffer> {
  const heading = await facebookHeadline(headline);
  const assets = await footer(instagram);
  return sharp(source, { limitInputPixels: 50_000_000, animated: false })
    .rotate().resize(1200, 900, { fit: "cover", position: "centre" })
    .flatten({ background: "#060b20" })
    .composite([
      { input: surfaces, left: 0, top: 0 },
      { input: heading.data, left: 52, top: 744 - heading.info.height },
      { input: assets.logo, left: 52, top: 800 },
      { input: assets.label, left: 850, top: 812 + Math.floor((58 - assets.labelHeight) / 2) },
    ])
    .jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
