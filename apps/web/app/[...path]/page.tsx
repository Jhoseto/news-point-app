import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticlePage } from "@/components/article-page";
import { CategoryPage } from "@/components/category-page";
import { shareOrigin } from "@/lib/share-card";
import { getArticleByPath, getCategoryByPath } from "@/lib/queries";

export const revalidate = 60;

// Empty on purpose: there is no finite list to bake at build time. The first
// visit stores the page, and revalidatePath refreshes it on publish.
export function generateStaticParams() {
  return [];
}

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
    return {
      title: category.name,
      description: `Новини от рубрика ${category.name} — NewsPoint.bg`,
      alternates: { canonical: `${origin}${category.path}` },
      openGraph: { title: category.name, description: `Новини от рубрика ${category.name}`, siteName: "NewsPoint.bg", locale: "bg_BG", type: "website", images: [{ url: image, width: 1200, height: 630 }] },
      twitter: { card: "summary_large_image", title: category.name, images: [image] },
    };
  }
  const article = await getArticleByPath(path);
  if (!article) return {};
  const image = `${origin}/share/article/${article.id}/`;
  const description = article.excerpt || article.title;
  return {
    title: article.title,
    description,
    alternates: { canonical: `${origin}${article.path}` },
    openGraph: { title: article.title, description, siteName: "NewsPoint.bg", locale: "bg_BG", type: "article", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: article.title, description, images: [image] },
  };
}

export default async function PathPage({ params }: Props) {
  const path = await resolvePath(params);
  const category = await getCategoryByPath(path);
  if (category) return <CategoryPage category={category} cursor={null} />;
  const article = await getArticleByPath(path);
  if (article) return <ArticlePage article={article} />;
  notFound();
}
