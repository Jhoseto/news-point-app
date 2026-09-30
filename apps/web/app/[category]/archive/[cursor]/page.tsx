import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryPage } from "@/components/category-page";
import { parseCategoryCursor } from "@/lib/category-pagination";
import { getCategoryByPath } from "@/lib/queries";

export const revalidate = 60;

type Props = { params: Promise<{ category: string; cursor: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: true } };
}

/** Later archive pages. The first rubric page stays on the catch-all route and does not read searchParams. */
export default async function CategoryArchivePage({ params }: Props) {
  const { category: slug, cursor: raw } = await params;
  const category = await getCategoryByPath(`/${decodeURIComponent(slug)}/`);
  if (!category) notFound();
  try {
    const cursor = parseCategoryCursor(decodeURIComponent(raw), category.id);
    if (!cursor) notFound();
    return <CategoryPage category={category} cursor={cursor} />;
  } catch {
    notFound();
  }
}
