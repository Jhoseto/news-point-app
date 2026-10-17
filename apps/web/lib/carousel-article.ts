import type { ArticleSummary } from "./queries";
import { articleImageAttrs } from "./article-image";

const CAROUSEL_IMAGE_SIZES = "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw";

/** Public carousel cards render no excerpt/caption/credit and use one lite URL.
 * Project before the client boundary, not after hydration: preserve every card
 * and its exact selected image/focal point without serializing unused variants.
 */
export function carouselArticle(article: ArticleSummary): ArticleSummary {
  const hero = article.hero;
  return {
    id: article.id, path: article.path, title: article.title, authorName: article.authorName,
    publishedAt: article.publishedAt, category: article.category, excerpt: "",
    hero: hero ? {
      url: articleImageAttrs(hero, { lite: true, sizes: CAROUSEL_IMAGE_SIZES }).src,
      width: hero.width, height: hero.height, alt: hero.alt, caption: "", credit: "",
      ...(hero.focalPoint !== undefined ? { focalPoint: hero.focalPoint } : {}),
    } : null,
  };
}
