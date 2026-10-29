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
    // The shelter's published host redirects to this observed canonical host.
    if (u.hostname === "register-dogs.com") u.hostname = "www.register-dogs.com";
    const paths: Record<string, RegExp> = {
      "panel.bilet.bg": /^\/media\/events\/[a-zA-Z0-9_.-]+$/u,
      "i.id24.bg": /^\/im\/ev\/[a-zA-Z0-9_.-]+$/u,
      "liveclubplovdiv.com": /^\/images\/[a-zA-Z0-9_.-]+$/u,
      "www.register-dogs.com": /^\/shelter\/uploads\/plovdivd_shelter\/\d+\/[a-zA-Z0-9_%.[\]-]+\.(?:jpg|jpeg|png|webp)$/iu,
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

export type TheatreProduction = { title: string; url: string; imageUrl?: string; duration?: string };

export function theatreProductions(html: string, minimum = 5): Map<string, TheatreProduction> {
  const dom = parseDocument(html);
  const productions = new Map<string, TheatreProduction>();
  const anchors = DomUtils.getElementsByTagName("a", dom).filter(node => /^(?:https:\/\/dtp\.bg)?\/show\/[a-z0-9-]+$/u.test(node.attribs.href ?? ""));
  for (const anchor of anchors) {
    const card = DomUtils.findOne(node => node.attribs?.class?.split(/\s/u).includes("show") || !!node.attribs?.class?.split(/\s/u).includes("hero") && node.attribs.class.split(/\s/u).includes("slider"), anchor.children);
    if (!card) continue;
    const title = DomUtils.getElementsByTagName("h1", card)[0] ?? DomUtils.getElementsByTagName("h2", card)[0];
    const img = DomUtils.getElementsByTagName("img", card).find(node => ["image", "background"].includes(node.attribs.class ?? ""));
    const imageUrl = eventImageUrl(img?.attribs.src, "https://dtp.bg/");
    const duration = DomUtils.findOne(node => node.attribs.class?.split(/\s/u).includes("duration") ?? false, card);
    if (title) productions.set(normalizeEventTitle(DomUtils.textContent(title)), {
      title: DomUtils.textContent(title).replace(/\s+/gu, " ").trim(),
      url: new URL(anchor.attribs.href!, "https://dtp.bg/").href,
      ...(imageUrl ? { imageUrl } : {}),
      ...(duration && /^\d{1,3}\s+минути$/u.test(DomUtils.textContent(duration).trim()) ? { duration: DomUtils.textContent(duration).trim() } : {}),
    });
  }
  if (productions.size < minimum) throw new Error("theatre: titled production details missing");
  return productions;
}

export function theatrePhotos(html: string): Map<string, string> {
  return new Map([...theatreProductions(html)].flatMap(([title, production]) => production.imageUrl ? [[title, production.imageUrl]] : []));
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

export function theatreDetailInformation(html: string, expectedTitle: string): { description: string; credits?: string } {
  const dom = parseDocument(html);
  const title = DomUtils.getElementsByTagName("h1", dom)[0];
  const actual = title ? normalizeEventTitle(DomUtils.textContent(title)) : "";
  const expected = normalizeEventTitle(expectedTitle);
  if (!title || actual !== expected && actual !== `новата ${expected}`) throw new Error("theatre detail: title mismatch");
  const markdown = DomUtils.findOne(node => node.attribs.class?.split(/\s/u).includes("markdown") ?? false, dom);
  const paragraphs = markdown ? DomUtils.getElementsByTagName("p", markdown).map(node => DomUtils.textContent(node).replace(/\s+/gu, " ").trim()).filter(Boolean) : [];
  const description = paragraphs.join("\n\n").slice(0, 20_000);
  if (description.length < 40) throw new Error("theatre detail: description missing");
  const author = title.parent ? DomUtils.getElementsByTagName("p", title.parent).map(node => DomUtils.textContent(node).replace(/\s+/gu, " ").trim()).find(Boolean) : undefined;
  return { description, ...(author ? { credits: author } : {}) };
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
