import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticlePage } from "@/components/article-page";
import { CategoryPage } from "@/components/category-page";
import { getArticleByPath, getCategoryByPath } from "@/lib/queries";
import { parseCategoryCursor } from "@/lib/category-pagination";

export const revalidate = 60;

type Props = { params: Promise<{ path: string[] }>; searchParams: Promise<{ cursor?: string | string[] }> };

// Articles and categories both live at the site root, as on WordPress (DEC-105).
async function resolvePath(params: Props["params"]): Promise<string> {
  const { path } = await params;
  return `/${path.map((segment) => decodeURIComponent(segment)).join("/")}/`;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const path = await resolvePath(params);
  const category = await getCategoryByPath(path);
  if (category) return {
    title: category.name,
    alternates: { canonical: `https://newspoint.bg${category.path}` },
    // Snapshot URLs must not create an unbounded set of indexed duplicates.
    ...((await searchParams).cursor !== undefined ? { robots: { index: false, follow: true } } : {}),
  };
  const article = await getArticleByPath(path);
  if (!article) return {};
  return {
    title: article.title,
    description: article.excerpt,
    openGraph: { title: article.title, description: article.excerpt, images: article.hero ? [article.hero.url] : [] },
  };
}

export default async function PathPage({ params, searchParams }: Props) {
  const path = await resolvePath(params);
  const category = await getCategoryByPath(path);
  if (category) {
    let cursor;
    try { cursor = parseCategoryCursor((await searchParams).cursor, category.id); }
    catch { notFound(); }
    return <CategoryPage category={category} cursor={cursor} />;
  }
  const article = await getArticleByPath(path);
  if (article) return <ArticlePage article={article} />;
  notFound();
}
