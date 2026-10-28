import type { Media, StoryThemeArticle } from "./queries";

/** Preserve the existing URL, empty alt and centered crop; only add responsive candidates. */
export function storyThemeImage(article: Pick<StoryThemeArticle, "heroUrl" | "heroImage">): Media | null {
  if (!article.heroUrl) return null;
  return {
    url: article.heroUrl,
    width: article.heroImage?.width ?? null,
    height: article.heroImage?.height ?? null,
    ...(article.heroImage?.variants ? { variants: article.heroImage.variants } : {}),
    alt: "", caption: "", credit: "",
  };
}

/** object-cover needs enough horizontal pixels to fill the unchanged square at any DPR. */
export function storyRailImageSizes(media: Media): string {
  const ratio = media.width && media.height ? media.width / media.height : 1;
  return `${Math.max(1, ratio) * 5.25}rem`;
}
