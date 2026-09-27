import { imageVariantSchema, responsiveImageVariants, type ImageVariant } from "@newspoint/content";
import type { WpMedia } from "./wp-client";

/** Read reported sizes only; filenames and availability are never guessed. */
export function wordpressVariants(media: WpMedia): ImageVariant[] {
  let source: URL;
  try { source = new URL(media.source_url); } catch { return []; }
  const width = media.media_details?.width;
  const height = media.media_details?.height;
  if (!width || !height) return [];
  const variants = Object.values(media.media_details?.sizes ?? {}).flatMap(size => {
    const parsed = imageVariantSchema.safeParse({ url: size.source_url, width: size.width, height: size.height });
    return parsed.success && new URL(parsed.data.url).origin === source.origin
      && parsed.data.width <= width && parsed.data.height <= height
      && Math.abs(parsed.data.width / parsed.data.height / (width / height) - 1) <= 0.01 ? [parsed.data] : [];
  }).sort((a, b) => a.width - b.width).slice(0, 5);
  return responsiveImageVariants(variants, {
    url: media.source_url, width: media.media_details?.width ?? null, height: media.media_details?.height ?? null,
  });
}
