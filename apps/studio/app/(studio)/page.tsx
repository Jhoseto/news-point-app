import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArticleFilterForm } from "@/components/article-filter-form";
import { queryArticleDesk } from "@/lib/article-desk";
import { articleListActive, articleListHref, pageWindow, parseArticleListQuery, shiftIsoDate, sofiaToday, type ArticleListQuery, type ArticleSort } from "@/lib/article-list-query";
import { listSections, type ArticleListItem } from "@/lib/articles";
import { formatWhen } from "@/lib/format";

export const metadata: Metadata = { title: "Материали" };
export const dynamic = "force-dynamic";

const number = new Intl.NumberFormat("bg-BG");

const control = "h-8 w-full rounded-md border border-line bg-surface px-2 text-xs text-ink outline-none focus:border-accent";
const caption = "mb-0.5 block text-[10px] font-semibold tracking-wide text-faint uppercase";

function StatusBadge({ article }: { article: ArticleListItem }) {
  if (article.hasUnpublishedChanges) {
    return <span className="rounded-full bg-warning/10 px-1.5 py-px text-[10px] font-bold text-warning">Промени</span>;
  }
  if (article.isPublic) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-px text-[10px] font-bold text-success">
        <span className="size-1 rounded-full bg-success" aria-hidden="true" />
        Публикувана
      </span>
    );
  }
  return <span className="rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-bold text-muted">Чернова</span>;
}

function sortHref(query: ArticleListQuery, sort: ArticleSort): string {
  const dir = query.sort === sort ? (query.dir === "asc" ? "desc" : "asc") : sort === "title" || sort === "author" ? "asc" : "desc";
  return articleListHref(query, { sort, dir, page: 1 });
}

function SortHeader({ query, sort, label, className = "" }: { query: ArticleListQuery; sort: ArticleSort; label: string; className?: string }) {
  const active = query.sort === sort;
  return (
    <th scope="col" aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : "none"} className={className}>
      <Link href={sortHref(query, sort)} className={`inline-flex items-center gap-1 ${active ? "text-ink" : "hover:text-ink"}`}>
        {label}
        <span aria-hidden="true" className="text-[0.65rem]">{active ? (query.dir === "asc" ? "↑" : "↓") : ""}</span>
      </Link>
    </th>
  );
}

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseArticleListQuery(await searchParams);
  const [desk, sections] = await Promise.all([queryArticleDesk(query), listSections()]);
  if (desk.page !== query.page) redirect(articleListHref(query, { page: desk.page }));

  const web = (process.env.WEB_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const today = sofiaToday();
  const presets = [
    { label: "Днес", from: today, to: today },
    { label: "7 дни", from: shiftIsoDate(today, -6), to: today },
    { label: "30 дни", from: shiftIsoDate(today, -29), to: today },
    { label: "Тази година", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
  const start = desk.shown === 0 ? 0 : (desk.page - 1) * query.pageSize + 1;
  const end = Math.min(desk.page * query.pageSize, desk.shown);
  const chips = [
    { status: "all" as const, label: "Всички", count: desk.matched },
    { status: "published" as const, label: "Публикувани", count: desk.published },
    { status: "draft" as const, label: "Чернови", count: desk.drafts },
    { status: "changed" as const, label: "С промени", count: desk.changed },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-none text-ink">Материали</h1>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {number.format(desk.total)} в базата · {number.format(start)}–{number.format(end)} от {number.format(desk.shown)}
          </p>
        </div>
        <Link href="/articles/new" className="np-btn np-btn-primary h-8 shrink-0 px-2.5 py-0 text-xs">
          + Нов
        </Link>
      </div>

      <ArticleFilterForm>
        {query.status !== "all" ? <input type="hidden" name="status" value={query.status} /> : null}
        <div className="flex gap-1.5">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Търсене</span>
            <input name="q" type="search" defaultValue={query.q} placeholder="Заглавие, адрес, резюме или автор" className={control} />
          </label>
          <button type="submit" className="np-btn np-btn-primary h-8 shrink-0 px-2.5 py-0 text-xs">Търси</button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10">
          <label>
            <span className={caption}>Източник</span>
            <select name="source" defaultValue={query.source} className={control}>
              <option value="all">Всички</option>
              <option value="wordpress">Импорт от WordPress</option>
              <option value="studio">Създадени в Studio</option>
            </select>
          </label>
          <label>
            <span className={caption}>Рубрика</span>
            <select name="category" defaultValue={query.category} className={control}>
              <option value="">Всички</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={caption}>Автор</span>
            <input name="author" type="text" defaultValue={query.author} placeholder="Подпис" className={control} />
          </label>
          <label>
            <span className={caption}>Снимка</span>
            <select name="hero" defaultValue={query.hero} className={control}>
              <option value="all">С и без</option>
              <option value="with">Има</option>
              <option value="without">Липсва</option>
            </select>
          </label>
          <label>
            <span className={caption}>Подредба</span>
            <select name="sort" defaultValue={query.sort} className={control}>
              <option value="updated">Последна промяна</option>
              <option value="published">Публикуване</option>
              <option value="title">Заглавие</option>
              <option value="author">Автор</option>
            </select>
          </label>
          <label>
            <span className={caption}>Посока</span>
            <select name="dir" defaultValue={query.dir} className={control}>
              <option value="desc">Низходящо</option>
              <option value="asc">Възходящо</option>
            </select>
          </label>
          <label>
            <span className={caption}>Дата</span>
            <select name="date" defaultValue={query.dateField} className={control}>
              <option value="updated">Промяна</option>
              <option value="published">Публикуване</option>
            </select>
          </label>
          <label>
            <span className={caption}>Брой</span>
            <select name="size" defaultValue={String(query.pageSize)} className={control}>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>
          <label>
            <span className={caption}>От</span>
            <input name="from" type="date" defaultValue={query.from} className={control} />
          </label>
          <label>
            <span className={caption}>До</span>
            <input name="to" type="date" defaultValue={query.to} className={control} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          {presets.map((preset) => {
            const active = query.from === preset.from && query.to === preset.to;
            return (
              <Link key={preset.label} href={articleListHref(query, { from: preset.from, to: preset.to, page: 1 })} className={`rounded-full px-2 py-px font-semibold ${active ? "bg-ink text-white" : "bg-surface-2 text-muted hover:text-ink"}`} aria-current={active ? "true" : undefined}>
                {preset.label}
              </Link>
            );
          })}
          {articleListActive(query) ? <Link href="/" className="font-semibold text-link">Изчисти</Link> : null}
        </div>
      </ArticleFilterForm>

      <nav aria-label="Статус" className="mb-2 flex flex-wrap gap-1">
        {chips.map((chip) => {
          const active = query.status === chip.status;
          return (
            <Link key={chip.status} href={articleListHref(query, { status: chip.status, page: 1 })} className={`rounded-full border px-2 py-px text-[11px] font-semibold ${active ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-muted hover:text-ink"}`} aria-current={active ? "true" : undefined}>
              {chip.label} <span className="tabular-nums">{number.format(chip.count)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="np-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px] leading-tight">
            <thead className="border-b border-line bg-surface-2/60 text-[10px] font-semibold tracking-wide text-faint uppercase">
              <tr>
                <SortHeader query={query} sort="title" label="Заглавие" className="px-3 py-1.5" />
                <th scope="col" className="px-2 py-1.5">Рубрика</th>
                <SortHeader query={query} sort="author" label="Автор" className="px-2 py-1.5" />
                <th scope="col" className="px-2 py-1.5">Статус</th>
                <SortHeader query={query} sort="published" label="Публикуване" className="px-2 py-1.5" />
                <SortHeader query={query} sort="updated" label="Промяна" className="px-3 py-1.5 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {desk.items.map((item) => (
                <tr key={item.id} className="group transition hover:bg-surface-2/50">
                  <td className="max-w-md px-3 py-1.5">
                    <Link href={`/articles/${item.id}`} className="block truncate font-semibold text-ink group-hover:text-accent">
                      {item.title || "Без заглавие"}
                    </Link>
                    <span className="block truncate text-[11px] text-faint">
                      {item.path}
                      <span className="ml-1.5 font-semibold tracking-wide uppercase">{item.sourceSystem === "wordpress" ? "WP" : "Studio"}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-muted">{item.categoryName ?? "—"}</td>
                  <td className="max-w-32 truncate px-2 py-1.5 text-xs text-muted">{item.authorName ?? "—"}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap"><StatusBadge article={item} /></td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted tabular-nums">
                    {item.publishedAt ? formatWhen(item.publishedAt) : "—"}
                    {item.isPublic ? (
                      <a href={`${web}${item.path.startsWith("/") ? item.path : `/${item.path}`}`} target="_blank" rel="noreferrer" className="ml-1.5 font-semibold text-link">сайт</a>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs whitespace-nowrap text-muted tabular-nums">{formatWhen(item.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {desk.items.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">
            {desk.total === 0 ? "Още няма материали." : "Няма материали за тези филтри."}
            {articleListActive(query) ? <> <Link href="/" className="font-bold text-link">Изчисти филтрите</Link></> : null}
          </p>
        ) : null}
        {desk.pageCount > 1 ? (
          <nav aria-label="Страници" className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-2 py-1.5 text-xs">
            <Link href={articleListHref(query, { page: Math.max(1, desk.page - 1) })} aria-disabled={desk.page === 1} className={`np-btn np-btn-secondary h-7 px-2 py-0 text-xs ${desk.page === 1 ? "pointer-events-none opacity-40" : ""}`}>Предишна</Link>
            <div className="flex flex-wrap items-center gap-0.5">
              {pageWindow(desk.page, desk.pageCount).map((item, index) => item === "gap" ? (
                <span key={`gap-${index}`} className="px-0.5 text-muted">…</span>
              ) : (
                <Link key={item} href={articleListHref(query, { page: item })} aria-current={item === desk.page ? "page" : undefined} className={`min-w-6 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums ${item === desk.page ? "bg-ink text-white" : "text-muted hover:bg-surface-2 hover:text-ink"}`}>{number.format(item)}</Link>
              ))}
            </div>
            <Link href={articleListHref(query, { page: Math.min(desk.pageCount, desk.page + 1) })} aria-disabled={desk.page === desk.pageCount} className={`np-btn np-btn-secondary h-7 px-2 py-0 text-xs ${desk.page === desk.pageCount ? "pointer-events-none opacity-40" : ""}`}>Следваща</Link>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
