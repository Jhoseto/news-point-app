/** Shared, quiet first frame for the OS launcher and the animated web layer. */
export const LAUNCH_BG = "#edf3f8";
export const LAUNCH_INK = "#142643";
export const LAUNCH_BLUE = "#315fc2";

export function launchMarkSvg(size = 512, maskable = false) {
  const radius = maskable ? 0 : 100;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    <defs><linearGradient id="plate" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#dbe7f1"/></linearGradient><linearGradient id="stroke" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#315fc2"/><stop offset="1" stop-color="#087b9d"/></linearGradient></defs>
    <rect width="512" height="512" rx="${radius}" fill="${LAUNCH_BG}"/>
    <rect x="68" y="68" width="376" height="376" rx="76" fill="url(#plate)" stroke="#ffffff" stroke-width="8"/>
    <path d="M166 350V162L346 350V162" fill="none" stroke="url(#stroke)" stroke-width="32" stroke-linecap="square" stroke-linejoin="round"/>
    <path d="M166 384H346" stroke="${LAUNCH_INK}" stroke-opacity=".2" stroke-width="5"/>
  </svg>`);
}

export function launchPosterSvg(width, height) {
  const unit = Math.min(width / 390, height / 844);
  const mark = Math.round(92 * unit);
  const centerY = Math.round(height * .46);
  const markX = Math.round((width - mark) / 2);
  const markY = centerY - Math.round(98 * unit);
  const titleY = centerY + Math.round(52 * unit);
  const captionY = centerY + Math.round(86 * unit);
  const lineY = centerY + Math.round(132 * unit);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8fbfd"/><stop offset="1" stop-color="${LAUNCH_BG}"/></linearGradient><linearGradient id="mark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${LAUNCH_BLUE}"/><stop offset="1" stop-color="#087b9d"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect x="${markX}" y="${markY}" width="${mark}" height="${mark}" rx="${Math.round(20 * unit)}" fill="#ffffff" stroke="#d4e1ed" stroke-width="${Math.max(1,Math.round(unit))}"/>
    <path d="M${markX+Math.round(mark*.3)} ${markY+Math.round(mark*.73)}V${markY+Math.round(mark*.27)}L${markX+Math.round(mark*.7)} ${markY+Math.round(mark*.73)}V${markY+Math.round(mark*.27)}" fill="none" stroke="url(#mark)" stroke-width="${Math.round(7*unit)}" stroke-linecap="square" stroke-linejoin="round"/>
    <text x="${width/2}" y="${titleY}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.round(31*unit)}" font-weight="800" letter-spacing="-1.3" fill="${LAUNCH_INK}">NewsPoint<tspan fill="${LAUNCH_BLUE}">.bg</tspan></text>
    <text x="${width/2}" y="${captionY}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.round(9*unit)}" font-weight="700" letter-spacing="${Math.round(2*unit)}" fill="#62748c">ГЛАСЪТ НА ИСТИНАТА</text>
    <rect x="${Math.round(width/2-51*unit)}" y="${lineY}" width="${Math.round(102*unit)}" height="${Math.max(2,Math.round(2*unit))}" rx="2" fill="#cbd9e8"/>
  </svg>`);
}
