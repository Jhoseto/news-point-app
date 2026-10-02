import type { Metadata } from "next";
import { listSubmissions } from "@/lib/submissions";
import { MyNewsManager } from "@/components/my-news-manager";
import { requireStaff } from "@/lib/session";

export const metadata: Metadata = { title: "Моята новина" };
export const dynamic = "force-dynamic";

export default async function MyNewsPage() {
  await requireStaff();
  const rows = await listSubmissions(undefined, "my_news");
  const initial = rows.map((row) => ({
    id: row.id,
    status: row.status,
    payload: row.payload as Record<string, unknown>,
    contact: row.contact,
    createdAt: row.createdAt.toISOString(),
    articleId: row.articleId,
  }));
  return (
    <MyNewsManager
      initial={initial}
      newArticleHref="/admin/articles/new"
    />
  );
}