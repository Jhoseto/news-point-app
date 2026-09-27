import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { ArticleCard } from "@/components/article-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ArrowRightIcon, SearchIcon } from "@/components/icons";
import { RecentSearches } from "@/components/recent-searches";
import { SectionTitle } from "@/components/ui";
import { getMenuCategories, getSearchArchive } from "@/lib/queries";
import { parseSearchCursor, parseSearchFilters, type SearchCursor, type SearchParams } from "@/lib/search-pagination";
import { filteredSearchUrl, normalizeSearchQuery, SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH, SEARCH_PAGE, SEARCH_PERIODS, searchTerms, type SearchFilters } from "@/lib/search";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Търсене", robots: { index: false, follow: true } };

function ResultsLoading() {
  return <div role="status" aria-live="polite" className="np-card flex min-h-32 items-center gap-3 p-6 text-body"><span aria-hidden="true" className="np-gradient-bg size-2.5 rounded-full motion-safe:animate-pulse" />Търсим подходящите новини…</div>;
}

async function SearchResults({ filters, categoryId, cursor }: { filters: SearchFilters; categoryId: string | null; cursor: SearchCursor | null }) {
  const archive = await getSearchArchive(filters, categoryId, cursor);
  const results = archive.articles;
  if (!results.length) return (
    <div className="np-card flex flex-col items-start gap-3 p-6">
      <p className="text-lg font-bold text-ink">{cursor ? "На тази страница вече няма достъпни резултати." : `Няма резултати за „${filters.query}“.`}</p>
      <p className="text-sm text-muted">Опитайте с друга дума, по-кратка форма или по-широк период.</p>
      <Link href={filteredSearchUrl({ ...filters, category: "", period: "all" })} prefetch={false} className="font-bold text-accent hover:underline">Търси отново без филтри</Link>
    </div>
  );
  return (
    <section aria-labelledby="search-results">
      <SectionTitle id="search-results">{`${results.length} ${results.length === 1 ? "статия" : "статии"} на тази страница`}</SectionTitle>
      {cursor ? <p className="mb-5 text-sm text-muted">Разглеждате по-ранни резултати. <Link href={filteredSearchUrl(filters)} prefetch={false} className="font-semibold text-accent hover:underline">Към най-новите</Link></p> : null}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
        {results.map(article => <ArticleCard key={article.id} article={article} showExcerpt />)}
      </div>
      {archive.previous || archive.next ? (
        <nav aria-label="Страници на резултатите" className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          {archive.previous ? <Link href={archive.previous} prefetch={false} rel="prev" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-surface-2"><ArrowRightIcon className="rotate-180" />Назад</Link> : <span />}
          {archive.next ? <Link href={archive.next} prefetch={false} rel="next" className="np-gradient-bg inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-on-accent shadow-card transition hover:brightness-110">Още резултати<ArrowRightIcon /></Link> : <span className="text-sm text-muted">Стигнахте края на резултатите</span>}
        </nav>
      ) : null}
    </section>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const menu = await getMenuCategories();
  let filters: SearchFilters = { query: normalizeSearchQuery((Array.isArray(params.q) ? params.q[0] : params.q) ?? ""), category: "", period: "all" };
  let cursor: SearchCursor | null = null;
  let invalid = false;
  try {
    filters = parseSearchFilters(params);
    if (filters.category && !menu.some(category => category.slug === filters.category)) throw new Error();
    cursor = parseSearchCursor(params.cursor, filters);
  } catch { invalid = true; }
  const searchable = searchTerms(filters.query).length > 0;
  const categoryId = menu.find(category => category.slug === filters.category)?.id ?? null;
  const chip = "inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-body transition hover:border-accent hover:text-accent aria-[current=true]:border-transparent aria-[current=true]:bg-accent aria-[current=true]:text-on-accent";

  return (
    <div data-np-search-archive className="np-container flex flex-col gap-8 pt-5 pb-10">
      <Breadcrumbs items={[{ name: "Търсене", path: SEARCH_PAGE }]} />
      <header className="flex flex-col gap-5">
        <h1 className="text-3xl font-extrabold tracking-tight break-words text-ink sm:text-4xl">{filters.query ? <>Резултати за <span className="np-gradient-text">„{filters.query}“</span></> : "Търсене"}</h1>
        <Form role="search" action={SEARCH_PAGE} prefetch={false} className="np-search relative flex max-w-2xl items-center">
          <label htmlFor="search-page-q" className="sr-only">Търси в статиите</label>
          <input type="hidden" name="category" value={filters.category} />
          <input type="hidden" name="period" value={filters.period} />
          <SearchIcon width={19} height={19} className="pointer-events-none absolute left-4 text-muted" />
          <input key={filters.query} id="search-page-q" name="q" type="search" defaultValue={filters.query} required minLength={SEARCH_MIN_LENGTH} maxLength={SEARCH_MAX_LENGTH} placeholder="Търси в статиите…" className="h-12 w-full rounded-full border border-line bg-surface pr-28 pl-11 text-[0.9375rem] text-ink placeholder:text-muted focus:border-accent/60 focus:outline-none" />
          <button type="submit" className="np-gradient-bg absolute right-1.5 rounded-full px-4 py-2 text-sm font-bold text-on-accent hover:brightness-110">Търси</button>
        </Form>
      </header>
      <section aria-label="Филтри за търсене" className="np-card flex flex-col gap-5 p-5 sm:p-6">
        <nav aria-label="Филтър по рубрика" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold text-muted">Рубрика{filters.category ? ` · ${menu.find(category => category.slug === filters.category)?.name ?? ""}` : ""}</h2><span className="text-xs text-muted sm:hidden">Плъзнете за още</span></div>
          <ul className="np-scroll-soft flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {[{ slug: "", name: "Всички рубрики" }, ...menu].map(category => <li key={category.slug} className="shrink-0"><Link href={filteredSearchUrl({ ...filters, category: category.slug })} prefetch={false} aria-current={filters.category === category.slug ? "true" : undefined} className={chip}>{category.name}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="Филтър по период" className="flex flex-col gap-3 border-t border-line pt-4">
          <h2 className="text-sm font-bold text-muted">Публикувано през</h2>
          <ul className="flex flex-wrap gap-2">
            {SEARCH_PERIODS.map(period => <li key={period.value}><Link href={filteredSearchUrl({ ...filters, period: period.value })} prefetch={false} aria-current={filters.period === period.value ? "true" : undefined} className={chip}>{period.label}</Link></li>)}
          </ul>
        </nav>
      </section>
      <RecentSearches query={filters.query} record={!invalid && searchable} />
      {invalid ? <div role="alert" className="np-card flex flex-col items-start gap-3 p-6"><p className="font-bold text-ink">Адресът съдържа невалидни филтри или страница.</p><Link href={filteredSearchUrl({ query: filters.query, category: "", period: "all" })} prefetch={false} className="font-bold text-accent hover:underline">Започни търсенето отново</Link></div>
        : !filters.query ? <p className="text-body">Въведете дума от заглавие или резюме на статия.</p>
        : !searchable ? <p role="status" className="text-body">Въведете поне {SEARCH_MIN_LENGTH} букви.</p>
        : <Suspense key={JSON.stringify([filters, params.cursor])} fallback={<ResultsLoading />}><SearchResults filters={filters} categoryId={categoryId} cursor={cursor} /></Suspense>}
    </div>
  );
}
