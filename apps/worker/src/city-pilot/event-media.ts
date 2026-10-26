import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { DomUtils, parseDocument } from "htmlparser2";

export function eventImageUrl(raw: unknown, base: string): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return null;
    const paths: Record<string, RegExp> = {
      "panel.bilet.bg": /^\/media\/events\/[a-zA-Z0-9_.-]+$/u,
      "i.id24.bg": /^\/im\/ev\/[a-zA-Z0-9_.-]+$/u,
      "liveclubplovdiv.com": /^\/images\/[a-zA-Z0-9_.-]+$/u,
      "www.clubcode.bg": /^\/website_files\//u,
      "operaplovdiv.bg": /^\/(?:media\/images\/|timthumb\.php$)/u,
      "galleryplovdiv.com": /^\/storage\//u,
      "online.epay.bg": /^\/v3\/eventpic\/\d+\/[\w-]+$/u,
      "storage.googleapis.com": /^\/is-dtp\/images\//u,
      "youthcentre.plovdiv.bg": /^\/(?:uploads|upload|media|images|files)\//u,
    };
    if (!paths[u.hostname]?.test(u.pathname)) return null;
    if (u.pathname === "/timthumb.php") {
      const source = new URL(u.searchParams.get("src") ?? "", "https://operaplovdiv.bg");
      if (source.origin !== "https://operaplovdiv.bg" || !source.pathname.startsWith("/media/images/")) return null;
    }
    return u.href;
  } catch { return null; }
}

export function theatrePhotos(html: string): Map<string, string> {
  const dom = parseDocument(html);
  const cards = DomUtils.findAll(node => node.attribs?.class === "show" || !!node.attribs?.class?.split(/\s/u).includes("hero") && node.attribs.class.split(/\s/u).includes("slider"), dom);
  const photos = new Map<string, string>();
  for (const card of cards) {
    const title = DomUtils.getElementsByTagName("h1", card)[0] ?? DomUtils.getElementsByTagName("h2", card)[0];
    const img = DomUtils.getElementsByTagName("img", card).find(node => ["image", "background"].includes(node.attribs.class ?? ""));
    const url = eventImageUrl(img?.attribs.src, "https://dtp.bg/");
    if (title && url) photos.set(normalizeEventTitle(DomUtils.textContent(title)), url);
  }
  if (photos.size < 5) throw new Error("theatre: titled production photographs missing");
  return photos;
}
export function normalizeEventTitle(title: string): string {
  return title.toLocaleLowerCase("bg").normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function theatreDetailPhoto(html: string, expectedTitle: string): string | null {
  const dom = parseDocument(html);
  const title = DomUtils.getElementsByTagName("h1", dom)[0];
  if (!title || normalizeEventTitle(DomUtils.textContent(title)) !== normalizeEventTitle(expectedTitle)) throw new Error("theatre photograph: title mismatch");
  const img = DomUtils.getElementsByTagName("img", dom).find(node => node.attribs.class?.includes("desktop-image"));
  return eventImageUrl(img?.attribs.src, "https://dtp.bg/");
}

export async function archiveEventImage(bytes: Uint8Array, outputDir: string): Promise<{ imageHash: string; imageWidth: number; imageHeight: number }> {
  if (bytes.byteLength > 12_000_000) throw new Error("event photograph exceeds byte budget");
  const input = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
  const meta = await input.metadata();
  if (!["jpeg", "png", "webp", "avif"].includes(meta.format ?? "") || !meta.width || !meta.height || meta.width < 160 || meta.height < 100) throw new Error("event: unsupported photograph");
  const result = await input.rotate().resize({ width: 1400, height: 1100, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
  const hash = createHash("sha256").update(result.data).digest("hex");
  await mkdir(resolve(outputDir, "event-images"), { recursive: true });
  await writeFile(resolve(outputDir, "event-images", `${hash}.webp`), result.data);
  return { imageHash: hash, imageWidth: result.info.width, imageHeight: result.info.height };
}
