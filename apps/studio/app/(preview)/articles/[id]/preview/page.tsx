import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArticlePreview } from "@/components/article-preview";
import { getPreview } from "@/lib/articles";
import { requireStaff } from "@/lib/session";

// DEC-108: preview lives only in Studio, behind the session, never cached.
export const metadata: Metadata = { title: "Преглед" };
export const dynamic = "force-dynamic";

export default async function PreviewPage({ params, searchParams }: PageProps<"/articles/[id]/preview">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  await requireStaff();
  const preview = await getPreview(id);
  if (!preview) notFound();
  const theme = (await searchParams).theme === "dark" ? "dark" : "light";

  return (
    <div className="min-h-dvh bg-page">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-shell text-white">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-3 px-4 py-2.5 text-sm sm:px-6">
          <span className="np-gradient-bg rounded-full px-2.5 py-0.5 text-xs font-extrabold tracking-wide uppercase">Преглед</span>
          <span className="text-white/75">
            {preview.revision ? `Версия ${preview.revision}` : "Без записана версия"} · {preview.isPublic ? "статията е публикувана; това е записаната версия" : "не е публично"}
          </span>
          <span className="ml-auto flex items-center gap-1 rounded-lg bg-white/8 p-0.5 text-xs font-bold">
            <Link href={`/articles/${id}/preview`} aria-current={theme === "light" ? "true" : undefined} className="rounded-md px-2.5 py-1 text-white/70 aria-[current=true]:bg-white aria-[current=true]:text-shell">
              Светла
            </Link>
            <Link href={`/articles/${id}/preview?theme=dark`} aria-current={theme === "dark" ? "true" : undefined} className="rounded-md px-2.5 py-1 text-white/70 aria-[current=true]:bg-white aria-[current=true]:text-shell">
              Тъмна
            </Link>
          </span>
          <Link href={`/articles/${id}`} className="font-bold text-white/85 hover:text-white">
            ← Към редакцията
          </Link>
        </div>
      </div>
      <ArticlePreview
        theme={theme}
        article={{
          title: preview.title,
          excerpt: preview.excerpt,
          blocks: preview.body,
          category: preview.category,
          hero: preview.hero,
          media: [],
          authorName: preview.authorName,
          publishedAt: preview.publishedAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
