// The only place that turns a MediaAsset into a URL (DEC-104). Switching the
// image source later means a data migration plus a new branch here.

export type MediaProvider = "wordpress_origin" | "object_storage";

export type MediaVariant = "original" | "hero" | "card" | "thumb";

export interface MediaLocation {
  provider: MediaProvider;
  sourceUrl: string | null;
  storageKey: string | null;
}

export function resolveMediaUrl(asset: MediaLocation, _variant: MediaVariant = "original"): string {
  switch (asset.provider) {
    case "wordpress_origin": {
      if (!asset.sourceUrl) {
        throw new Error("wordpress_origin media asset has no sourceUrl");
      }
      // Browsers load WordPress originals directly; variants apply once we
      // serve from our own storage.
      return asset.sourceUrl;
    }
    case "object_storage":
      throw new Error("object_storage media is not configured yet");
  }
}
