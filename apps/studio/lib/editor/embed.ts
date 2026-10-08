export type EmbedProvider = "youtube" | "facebook" | "instagram" | "x" | "tiktok" | "other";

function providerFromHost(hostname: string): EmbedProvider {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  if (host === "facebook.com" || host.endsWith(".facebook.com")) return "facebook";
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be" || host.endsWith(".youtube.com")) return "youtube";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) return "x";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  return "other";
}

/** Pull an https URL from a bare link or a pasted Facebook/YouTube iframe snippet. */
export function parseEmbedInput(raw: string): { url: string; provider: EmbedProvider } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  const iframeSrc =
    trimmed.match(/<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i) ??
    trimmed.match(/\bsrc\s*=\s*["'](https:\/\/[^"']+)["']/i);
  if (iframeSrc?.[1]) {
    candidate = iframeSrc[1].replace(/&amp;/gi, "&").replace(/&#38;/g, "&");
  } else {
    candidate = candidate.replace(/^["']|["']$/g, "").trim();
  }

  if (!/^https:\/\//i.test(candidate)) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  const provider = providerFromHost(parsed.hostname);
  return { url: parsed.href, provider };
}
