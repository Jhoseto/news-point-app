import type { Block } from "@newspoint/content";
import type { LightboxImage } from "../components/article-lightbox";
import type { Media } from "./queries";

export interface ArticleImageGallery {
  images: LightboxImage[];
  bodyIndices: Map<number, number>;
}

/** Only displayed images, in article order, with each occurrence's editorial copy. */
export function articleImageGallery(blocks: Block[], media: Map<string, Media>, hero: Media | null = null): ArticleImageGallery {
  const images: LightboxImage[] = [];
  const bodyIndices = new Map<number, number>();
  if (hero?.url) images.push({ src: hero.url, alt: hero.alt, caption: hero.caption, credit: hero.credit });
  blocks.forEach((block, index) => {
    if (block.type !== "image") return;
    const asset = media.get(block.mediaAssetId);
    if (!asset?.url) return;
    bodyIndices.set(index, images.length);
    images.push({ src: asset.url, alt: block.alt ?? asset.alt, caption: block.caption ?? asset.caption, credit: asset.credit });
  });
  return { images, bodyIndices };
}
