import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArticleEditor } from "@/components/article-editor";
import { getEditorArticle, listRecentMedia, listSections } from "@/lib/articles";
import { bodyImageIds } from "@/lib/editor/body";
import { getArticleStoryThemeId, listStoryThemeOptions } from "@/lib/story-themes";
import { requireStaff } from "@/lib/session";

export const metadata: Metadata = { title: "Редакция" };
export const dynamic = "force-dynamic";

export default async function EditArticlePage({ params }: PageProps<"/articles/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const staff = await requireStaff();
  const article = await getEditorArticle(id);
  if (!article) notFound();
  const includeMedia = [article.draft.heroMediaId, ...(article.draft.body?.flatMap(block => block.type === "image" ? [block.mediaAssetId] : []) ?? bodyImageIds(article.draft.bodyText))].filter(Boolean) as string[];
  const [sections, media, storyThemes, storyThemeId] = await Promise.all([
    listSections(),
    listRecentMedia(48, includeMedia),
    listStoryThemeOptions(),
    getArticleStoryThemeId(id),
  ]);
  const { draft, revisionSavedAt, publishedAt, ...rest } = article;
  return (
    <ArticleEditor
      key={id}
      staff={{ id: staff.id, name: staff.name }}
      article={{ ...rest, publishedAt: publishedAt?.toISOString() ?? null, revisionSavedAt: revisionSavedAt?.toISOString() ?? null }}
      draft={draft}
      sections={sections}
      media={media}
      storyThemes={storyThemes}
      storyThemeId={storyThemeId}
      webUrl={process.env.WEB_URL ?? "http://localhost:3000"}
    />
  );
}
