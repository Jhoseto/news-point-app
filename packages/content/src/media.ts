// The only place that turns a MediaAsset into a URL (DEC-104). Switching the
// image source later means a data migration plus a new branch here.

export type MediaProvider = "wordpress_origin" | "object_storage";

export type MediaVariant = "original" | "hero" | "card" | "thumb";

export interface MediaLocation {
  provider: MediaProvider;
  sourceUrl: string | null;
  storageKey: string | null;
}

/** WordPress upload path kept as news/YYYY/MM/file so copies stay grouped by date. */
export function newsStorageKey(sourceUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "newspoint.bg") return null;
  const marker = "/wp-content/uploads/";
  const index = url.pathname.indexOf(marker);
  if (index < 0) return null;
  let rest = "";
  try {
    rest = decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
  const parts = rest.split("/");
  if (!parts.length || parts.some((part) => !part || part === "." || part === "..")) return null;
  return `news/${parts.join("/")}`;
}

export function mediaPublicPath(storageKey: string): string | null {
  if (!storageKey.startsWith("news/") || storageKey.includes("\\") || storageKey.includes("..")) return null;
  const parts = storageKey.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return `/media/${storageKey}`;
}

export function resolveMediaUrl(asset: MediaLocation, _variant: MediaVariant = "original"): string {
  if (asset.storageKey) {
    const local = mediaPublicPath(asset.storageKey);
    if (local) return local;
  }
  switch (asset.provider) {
    case "wordpress_origin": {
      if (!asset.sourceUrl) {
        throw new Error("wordpress_origin media asset has no sourceUrl");
      }
      return asset.sourceUrl;
    }
    case "object_storage":
      throw new Error("object_storage media is not configured yet");
  }
}
