const FB_VIDEO = "https://www.facebook.com/plugins/video.php";

export function embedProviderFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (/(^|\.)facebook\.com$/.test(host)) return "facebook";
    if (/(^|\.)youtube(-nocookie)?\.com$|^youtu\.be$/.test(host)) return "youtube";
    if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
    if (/(^|\.)(twitter|x)\.com$/.test(host)) return "x";
  } catch {
    // fall through
  }
  return "other";
}

/** Normalize third-party embed URLs for in-article iframes (mobile-friendly where needed). */
export function articleEmbedPlayUrl(url: string, provider: string): string {
  if (provider !== "facebook") return url;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.replace(/^www\./, "").endsWith("facebook.com")) return url;
    const isVideo =
      parsed.pathname.endsWith("/video.php") ||
      parsed.pathname.endsWith("/plugins/video.php") ||
      parsed.pathname.includes("/plugins/video.php");
    if (!isVideo) return url;

    const href = parsed.searchParams.get("href");
    if (!href) return url;

    const out = new URL(FB_VIDEO);
    out.searchParams.set("href", href);
    out.searchParams.set("show_text", parsed.searchParams.get("show_text") ?? "false");
    out.searchParams.set("width", parsed.searchParams.get("width") ?? "560");
    out.searchParams.set("height", parsed.searchParams.get("height") ?? "315");
    const t = parsed.searchParams.get("t");
    if (t) out.searchParams.set("t", t);
    return out.href;
  } catch {
    return url;
  }
}
