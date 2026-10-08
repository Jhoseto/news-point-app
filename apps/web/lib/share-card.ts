import sharp from "sharp";
import { loadRootEnv } from "@newspoint/db";

let originEnvLoaded = false;

/** Same clock as the player — kept local so share-card stays server-safe. */
function episodeClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(rest).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

function xml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

/** Exported for unit tests — wrap titles for OG cards. */
export function shareCardLines(title: string, width = 34, max = 3): string[] {
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

async function fetchSharePhoto(imageUrl?: string | null): Promise<Buffer | null> {
  if (!imageUrl) return null;
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(4000) });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  } catch {
    /* Fall through to branded card without photo. */
  }
  return null;
}

export async function shareCard(input: { title: string; kicker: string; imageUrl?: string | null; color: string }): Promise<Buffer> {
  const photo = await fetchSharePhoto(input.imageUrl);
  let base: Buffer | null = null;
  if (photo) {
    try { base = await sharp(photo).resize(1200, 630, { fit: "cover", position: "attention" }).png().toBuffer(); }
    catch { /* An unavailable or invalid photo still gets an honest branded card. */ }
  }
  base ??= await sharp({ create: { width: 1200, height: 630, channels: 3, background: input.color } }).png().toBuffer();
  const title = shareCardLines(input.title).map((line, index) => `<tspan x="72" dy="${index === 0 ? 0 : 58}">${xml(line)}</tspan>`).join("");
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

/**
 * OG / chat preview card for a podcast episode: branded canvas, rounded cover,
 * play badge, duration and series label — 1200×630 for Facebook/WhatsApp/Viber/Telegram.
 */
export async function podcastShareCard(input: {
  title: string;
  durationSec: number;
  categoryName?: string | null;
  imageUrl?: string | null;
}): Promise<Buffer> {
  const accent = "#6ea8ff";
  const photo = await fetchSharePhoto(input.imageUrl);
  const canvas = await sharp({
    create: { width: 1200, height: 630, channels: 3, background: "#070b22" },
  }).png().toBuffer();

  const layers: Array<{ input: Buffer; left?: number; top?: number }> = [];
  if (photo) {
    try {
      const mask = Buffer.from(
        `<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg"><rect width="480" height="480" rx="40" ry="40" fill="#fff"/></svg>`,
      );
      const cover = await sharp(photo)
        .resize(480, 480, { fit: "cover", position: "attention" })
        .composite([{ input: mask, blend: "dest-in" }])
        .png()
        .toBuffer();
      layers.push({ input: cover, left: 72, top: 75 });
    } catch {
      /* Keep the branded canvas without cover art. */
    }
  }

  const titleRows = shareCardLines(input.title, 22, 4);
  const title = titleRows.map((line, index) => `<tspan x="612" dy="${index === 0 ? 0 : 52}">${xml(line)}</tspan>`).join("");
  const duration = episodeClock(input.durationSec);
  const category = (input.categoryName ?? "NewsPodcast").trim() || "NewsPodcast";
  const meta = `${duration}  ·  ${category}`;
  const overlay = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" cx="18%" cy="40%" r="55%"><stop offset="0" stop-color="#3d6fd4" stop-opacity="0.45"/><stop offset="1" stop-color="#070b22" stop-opacity="0"/></radialGradient>
      <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8ec5ff"/><stop offset="1" stop-color="#5b6cff"/></linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#glow)"/>
    <circle cx="1080" cy="80" r="160" fill="#5b6cff" opacity="0.12"/>
    <circle cx="1140" cy="540" r="120" fill="#8ec5ff" opacity="0.08"/>
    ${photo ? "" : `<rect x="72" y="75" width="480" height="480" rx="40" ry="40" fill="#121a3a"/>`}
    <circle cx="456" cy="459" r="44" fill="#070b22" opacity="0.55"/>
    <circle cx="456" cy="459" r="36" fill="url(#bar)"/>
    <polygon points="448,442 448,476 474,459" fill="#ffffff"/>
    <rect x="612" y="118" width="72" height="7" rx="3.5" fill="url(#bar)"/>
    <text x="612" y="168" fill="${accent}" font-family="Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="3">NEWSPODCAST</text>
    <text x="612" y="260" fill="#ffffff" font-family="Arial, sans-serif" font-size="44" font-weight="800">${title}</text>
    <text x="612" y="500" fill="#c9dbf5" font-family="Arial, sans-serif" font-size="24" font-weight="600">${xml(meta)}</text>
    <text x="612" y="560" fill="#ffffff" font-family="Arial, sans-serif" font-size="26" font-weight="700" opacity="0.92">NewsPoint.bg</text>
  </svg>`;
  layers.push({ input: Buffer.from(overlay) });
  return sharp(canvas).composite(layers).png().toBuffer();
}

export function shareOrigin(): string {
  // Static metadata can run before the first DB query loads the monorepo env.
  // Resolve it here too so homepage, robots and cached pages use the same host.
  if (!originEnvLoaded && process.env.NODE_ENV !== "test") {
    loadRootEnv();
    originEnvLoaded = true;
  }
  const value = (process.env.WEB_URL ?? "https://newspoint.bg").trim();
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("WEB_URL must be a public HTTP(S) origin."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !/^\/*$/.test(url.pathname)) {
    throw new Error("WEB_URL must be a public HTTP(S) origin without credentials, path or query.");
  }
  return url.origin;
}

export function absoluteMedia(url: string, origin: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${origin}${url.startsWith("/") ? url : `/${url}`}`;
}
