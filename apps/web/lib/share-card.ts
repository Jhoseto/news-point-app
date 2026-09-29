import sharp from "sharp";

function xml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

function lines(title: string, width = 34, max = 3): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      rows.push(line);
      line = word;
      if (rows.length === max) return rows;
    } else line = next;
  }
  if (line && rows.length < max) rows.push(line);
  return rows.length ? rows : ["NewsPoint.bg"];
}

export async function shareCard(input: { title: string; kicker: string; imageUrl?: string | null; color: string }): Promise<Buffer> {
  let photo: Buffer | null = null;
  if (input.imageUrl) {
    try {
      const response = await fetch(input.imageUrl, { signal: AbortSignal.timeout(4000) });
      if (response.ok) photo = Buffer.from(await response.arrayBuffer());
    } catch {
      photo = null;
    }
  }
  const base = photo
    ? await sharp(photo).resize(1200, 630, { fit: "cover", position: "attention" }).png().toBuffer()
    : await sharp({ create: { width: 1200, height: 630, channels: 3, background: input.color } }).png().toBuffer();
  const title = lines(input.title).map((line, index) => `<tspan x="72" dy="${index === 0 ? 0 : 58}">${xml(line)}</tspan>`).join("");
  const overlay = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b22" stop-opacity="0.15"/><stop offset="1" stop-color="#070b22" stop-opacity="0.88"/></linearGradient></defs>
    <rect width="1200" height="630" fill="url(#fade)"/>
    <rect x="72" y="78" width="84" height="8" rx="4" fill="${xml(input.color)}"/>
    <text x="72" y="124" fill="#ffffff" font-family="Arial, sans-serif" font-size="28" font-weight="700">${xml(input.kicker)}</text>
    <text x="72" y="250" fill="#ffffff" font-family="Arial, sans-serif" font-size="52" font-weight="800">${title}</text>
    <text x="72" y="560" fill="#ffffff" font-family="Arial, sans-serif" font-size="28" font-weight="700" opacity="0.9">NewsPoint.bg</text>
  </svg>`;
  return sharp(base).composite([{ input: Buffer.from(overlay) }]).png().toBuffer();
}

export function shareOrigin(): string {
  return (process.env.WEB_URL ?? "https://newspoint.bg").replace(/\/+$/, "");
}

export function absoluteMedia(url: string, origin: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${origin}${url.startsWith("/") ? url : `/${url}`}`;
}
