import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticlePage } from "@/components/article-page";
import { CategoryPage } from "@/components/category-page";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbList, newsArticle } from "@/lib/jsonld";
import { absoluteMedia, shareOrigin } from "@/lib/share-card";
import { publicMetadata } from "@/lib/public-metadata";
import { getArticleByPath, getCategoryByPath, getStoryThemesForArticle } from "@/lib/queries";

export const revalidate = 60;

// No generateStaticParams: CategoryPage reads viewport Client Hints via headers(),
// which is incompatible with on-demand static generation (DYNAMIC_SERVER_USAGE).
// Data still uses unstable_cache (60s) + revalidatePath on publish.

type Props = { params: Promise<{ path: string[] }> };

// Articles and categories both live at the site root, as on WordPress (DEC-105).
async function resolvePath(params: Props["params"]): Promise<string> {
  const { path } = await params;
  return `/${path.map((segment) => decodeURIComponent(segment)).join("/")}/`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const path = await resolvePath(params);
  const origin = shareOrigin();
  const category = await getCategoryByPath(path);
  if (category) {
    const image = `${origin}/share/category/${category.id}/`;
    return publicMetadata({ path: category.path, title: category.name, description: `Новини от рубрика ${category.name} — NewsPoint.bg`, imagePath: image });
  }
  const article = await getArticleByPath(path);
  if (!article) notFound();
  const image = `${origin}/share/article/${article.id}/`;
  const description = article.excerpt || article.title;
  return publicMetadata({ path: article.path, title: article.title, description, imagePath: image, type: "article", publishedTime: article.publishedAt.toISOString(), modifiedTime: (article.updatedAt ?? article.publishedAt).toISOString() });
}

export default async function PathPage({ params }: Props) {
  const path = await resolvePath(params);
  const category = await getCategoryByPath(path);
  if (category) {
    const origin = shareOrigin();
    const crumbs = breadcrumbList(origin, [
      { name: "Начало", path: "/" },
      { name: category.name },
    ]);
    return (
      <>
        <JsonLd data={crumbs} id="np-ld-breadcrumb" />
        <CategoryPage category={category} cursor={null} />
      </>
    );
  }
  const article = await getArticleByPath(path);
  if (article) {
    const origin = shareOrigin();
    const breadcrumbs = breadcrumbList(origin, [
      { name: "Начало", path: "/" },
      ...(article.category ? [{ name: article.category.name, path: article.category.path }] : []),
      { name: article.title },
    ]);
    const articleLd = newsArticle({
      origin,
      organizationId: `${origin}/#organization`,
      path: article.path,
      title: article.title,
      excerpt: article.excerpt,
      imageUrl: article.hero?.url ? absoluteMedia(article.hero.url, origin) : undefined,
      datePublished: article.publishedAt.toISOString(),
      dateModified: (article.updatedAt ?? article.publishedAt).toISOString(),
      authorName: article.authorName,
      sectionName: article.category?.name,
    });
    const storyThemes = await getStoryThemesForArticle(article.id);
    // Skip the heavy query when the article is not part of any theme.
    const compact = storyThemes.length > 0
      ? await import("@/lib/queries").then((m) => m.getStoryThemeCompact(article.id))
      : null;
    return (
      <>
        <JsonLd data={[breadcrumbs, articleLd]} id="np-ld-article" />
        <ArticlePage article={article} storyThemes={storyThemes} storyThemeCompact={compact} />
      </>
    );
  }
  notFound();
}
