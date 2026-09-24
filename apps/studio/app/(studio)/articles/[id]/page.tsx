import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArticleEditor } from "@/components/article-editor";
import { getEditorArticle, listRecentMedia, listSections } from "@/lib/articles";
import { requireStaff } from "@/lib/session";

export const metadata: Metadata = { title: "Редакция" };
export const dynamic = "force-dynamic";

export default async function EditArticlePage({ params }: PageProps<"/articles/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  await requireStaff();
  const article = await getEditorArticle(id);
  if (!article) notFound();
  const [sections, media] = await Promise.all([listSections(), listRecentMedia(48, article.draft.heroMediaId)]);
  const { draft, revisionSavedAt, publishedAt, ...rest } = article;
  return (
    <ArticleEditor
      key={id}
      article={{ ...rest, publishedAt: publishedAt?.toISOString() ?? null, revisionSavedAt: revisionSavedAt?.toISOString() ?? null }}
      draft={draft}
      sections={sections}
      media={media}
      webUrl={process.env.WEB_URL ?? "http://localhost:3000"}
    />
  );
}
