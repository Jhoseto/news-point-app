import { placeCategory } from "./category-map";
import type { Conversion } from "./convert";
import type { ArticleInput, CategoryInput, MediaInput } from "./persist";
import { htmlToPlainText, pathFromLink, wpGmtToDate } from "./text";
import { featuredMedia, type WpCategory, type WpPost } from "./wp-client";

export function toCategoryInputs(wpCategories: WpCategory[]): CategoryInput[] {
  return wpCategories.map((category) => {
    const placement = placeCategory(category.slug);
    return {
      wpId: category.id,
      slug: category.slug,
      name: placement.displayName ?? htmlToPlainText(category.name),
      path: pathFromLink(category.link),
      kind: placement.kind,
      inMenu: placement.inMenu,
      menuOrder: placement.menuOrder,
    };
  });
}

export function toArticleInput(post: WpPost): ArticleInput {
  return {
    legacyId: post.id,
    slug: post.slug,
    path: pathFromLink(post.link),
    sourceUrl: post.link,
    title: htmlToPlainText(post.title.rendered),
    excerpt: htmlToPlainText(post.excerpt.rendered).replace(/\s*\[?(…|&hellip;|\.\.\.)\]?$/, "…"),
    sourceHtml: post.content.rendered,
    isPublic: post.status === "publish",
    publishedAt: wpGmtToDate(post.date_gmt),
    sourceModifiedAt: wpGmtToDate(post.modified_gmt),
    categoryWpIds: post.categories,
  };
}

export function heroInput(post: WpPost): MediaInput | null {
  const media = featuredMedia(post);
  if (!media) return null;
  return {
    wpId: media.id,
    sourceUrl: media.source_url,
    width: media.media_details?.width ?? null,
    height: media.media_details?.height ?? null,
    mime: media.mime_type ?? null,
    alt: htmlToPlainText(media.alt_text ?? ""),
    caption: htmlToPlainText(media.caption?.rendered ?? ""),
  };
}

export function inlineInputs(conversion: Conversion): MediaInput[] {
  return conversion.images.map((image) => ({
    wpId: null,
    sourceUrl: image.src,
    width: image.width,
    height: image.height,
    mime: null,
    alt: image.alt,
    caption: "",
  }));
}
