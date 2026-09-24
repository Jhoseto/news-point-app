import type { Metadata } from "next";
import Link from "next/link";
import { listArticles, type ArticleListItem } from "@/lib/articles";
import { formatWhen } from "@/lib/format";

export const metadata: Metadata = { title: "Материали" };
export const dynamic = "force-dynamic";

function StatusBadge({ article }: { article: ArticleListItem }) {
  if (article.hasUnpublishedChanges) {
    return <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning">Непубликувани промени</span>;
  }
  if (article.isPublic) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
        <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
        Публикувана
      </span>
    );
  }
  return <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted">Чернова</span>;
}

export default async function ArticlesPage() {
  const items = await listArticles(50);
  const drafts = items.filter((item) => !item.isPublic).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Материали</h1>
          <p className="mt-1 text-sm text-muted">
            Последните {items.length} по промяна · {drafts} {drafts === 1 ? "чернова" : "чернови"}
          </p>
        </div>
        <Link href="/articles/new" className="np-btn np-btn-primary">
          <span aria-hidden="true" className="text-lg leading-none">+</span> Нов материал
        </Link>
      </div>

      <div className="np-card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface-2/60 text-xs font-bold tracking-wide text-muted uppercase">
            <tr>
              <th scope="col" className="px-5 py-3">Заглавие</th>
              <th scope="col" className="hidden px-4 py-3 md:table-cell">Рубрика</th>
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">Автор</th>
              <th scope="col" className="px-4 py-3">Статус</th>
              <th scope="col" className="hidden px-5 py-3 text-right sm:table-cell">Промяна</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((item) => (
              <tr key={item.id} className="group transition hover:bg-surface-2/50">
                <td className="max-w-0 px-5 py-3.5">
                  <Link href={`/articles/${item.id}`} className="line-clamp-2 font-bold text-ink group-hover:text-accent">
                    {item.title || "Без заглавие"}
                  </Link>
                  {item.sourceSystem === "wordpress" ? (
                    <span className="mt-1 inline-block text-[0.6875rem] font-bold tracking-wide text-faint uppercase">Импорт от WordPress</span>
                  ) : null}
                </td>
                <td className="hidden px-4 py-3.5 text-muted md:table-cell">{item.categoryName ?? "—"}</td>
                <td className="hidden px-4 py-3.5 text-muted lg:table-cell">{item.authorName ?? "—"}</td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <StatusBadge article={item} />
                </td>
                <td className="hidden px-5 py-3.5 text-right whitespace-nowrap text-muted tabular-nums sm:table-cell">{formatWhen(item.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? <p className="p-8 text-center text-muted">Още няма материали.</p> : null}
      </div>
    </div>
  );
}
