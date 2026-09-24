import type { Metadata } from "next";
import { ArticleCard } from "@/components/article-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SearchIcon } from "@/components/icons";
import { SectionTitle } from "@/components/ui";
import { searchArticles } from "@/lib/queries";
import { SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH, SEARCH_PAGE, searchTerms } from "@/lib/search";

export const dynamic = "force-dynamic";

const LIMIT = 30;

export const metadata: Metadata = { title: "Търсене", robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, SEARCH_MAX_LENGTH) ?? "";
  const searchable = searchTerms(query).length > 0;
  const results = searchable ? await searchArticles(query, LIMIT) : [];

  return (
    <div className="np-container flex flex-col gap-8 pt-5 pb-10">
      <Breadcrumbs items={[{ name: "Търсене", path: SEARCH_PAGE }]} />

      <header className="flex flex-col gap-5">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {query ? (
            <>
              Резултати за <span className="np-gradient-text">„{query}“</span>
            </>
          ) : (
            "Търсене"
          )}
        </h1>
        <form role="search" action={SEARCH_PAGE} method="get" className="np-search relative flex max-w-2xl items-center">
          <label htmlFor="search-page-q" className="sr-only">
            Търси в статиите
          </label>
          <SearchIcon width={19} height={19} className="pointer-events-none absolute left-4 text-muted" />
          <input
            id="search-page-q"
            name="q"
            type="search"
            defaultValue={query}
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Търси в статиите…"
            className="h-12 w-full rounded-full border border-line bg-surface pr-28 pl-11 text-[0.9375rem] text-ink placeholder:text-muted focus:border-accent/60 focus:outline-none"
          />
          <button
            type="submit"
            className="np-gradient-bg absolute right-1.5 rounded-full px-4 py-2 text-sm font-bold text-on-accent hover:brightness-110"
          >
            Търси
          </button>
        </form>
      </header>

      {!query ? (
        <p className="text-body">Въведете дума от заглавие или резюме на статия.</p>
      ) : !searchable ? (
        <p className="text-body">Въведете поне {SEARCH_MIN_LENGTH} букви.</p>
      ) : results.length === 0 ? (
        <div className="np-card flex flex-col items-start gap-2 p-6">
          <p className="text-lg font-bold text-ink">Няма резултати за „{query}“.</p>
          <p className="text-sm text-muted">Опитайте с друга дума или по-кратка форма, например само корена на думата.</p>
        </div>
      ) : (
        <section aria-labelledby="search-results">
          <SectionTitle id="search-results">
            {results.length === LIMIT ? `Първите ${LIMIT} статии` : `${results.length} ${results.length === 1 ? "статия" : "статии"}`}
          </SectionTitle>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
            {results.map((article) => (
              <ArticleCard key={article.id} article={article} showExcerpt />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
