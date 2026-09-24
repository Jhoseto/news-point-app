import { ArticleCard, CompactCard, FeatureCard, HeroCard } from "@/components/article-card";
import { CategoryChips, CompactList, LatestList } from "@/components/lists";
import { BrandBanner } from "@/components/site-chrome";
import { SectionTitle } from "@/components/ui";
import { UniquePicker } from "@/lib/pick";
import { getByCategory, getLabelled, getLatest, getMenuCategories, type ArticleSummary, type CategoryRef } from "@/lib/queries";

export const revalidate = 60;

// Section order follows the approved mockup: Пловдив first, then the menu.
const LEAD_SECTION = "plovdiv";
const ASIDE_SECTIONS = ["zdrave", "kultura", "lajfstajl"];
// Editors on the old site mark headline stories with this label; "top-novina"
// is used for daily features (horoscope, weather), so it does not lead.
const LEADING_LABEL = "novini";

type Layout = "grid" | "feature";

function CategorySection({ category, articles, layout }: { category: CategoryRef; articles: ArticleSummary[]; layout: Layout }) {
  if (!articles.length) return null;
  const [first, ...rest] = articles;
  return (
    <section aria-labelledby={`sec-${category.slug}`}>
      <SectionTitle id={`sec-${category.slug}`} href={category.path}>
        {category.name}
      </SectionTitle>
      {layout === "feature" && first ? (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <FeatureCard article={first} />
          <div className="np-card flex flex-col gap-4 p-4">
            {rest.map((article) => (
              <CompactCard key={article.id} article={article} />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function HomePage() {
  const [latest, featured, menu] = await Promise.all([getLatest(40), getLabelled(LEADING_LABEL, 4), getMenuCategories()]);
  const sections = await Promise.all(menu.map(async (category) => ({ category, pool: await getByCategory(category.id, 8) })));
  const menuIds = new Set(menu.map((category) => category.id));

  const picker = new UniquePicker();
  const [hero] = picker.take(
    latest.filter((article) => article.category && menuIds.has(article.category.id)),
    1,
  );
  const timeline = picker.take(latest, 7);
  const leading = [...picker.take(featured, 4)];
  leading.push(...picker.take(latest, 4 - leading.length));

  const ordered = [
    ...sections.filter((s) => s.category.slug === LEAD_SECTION),
    ...sections.filter((s) => s.category.slug !== LEAD_SECTION && !ASIDE_SECTIONS.includes(s.category.slug)),
  ];
  const mainSections = ordered.map((section, index) => ({
    ...section,
    layout: (index % 2 === 1 ? "feature" : "grid") as Layout,
    articles: picker.take(section.pool, 4),
  }));
  const asideSections = sections
    .filter((s) => ASIDE_SECTIONS.includes(s.category.slug))
    .map((section) => ({ ...section, articles: picker.take(section.pool, 4) }));

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pt-6 pb-10 sm:px-6 lg:pt-8">
      <h1 className="sr-only">NewsPoint.bg – новини</h1>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {hero ? <HeroCard article={hero} /> : null}
        <LatestList articles={timeline} id="posledni" />
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-10">
          {leading.length ? (
            <section aria-labelledby="sec-leading">
              <SectionTitle id="sec-leading">Водещи новини</SectionTitle>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {leading.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            </section>
          ) : null}
          {mainSections.map((section) => (
            <CategorySection key={section.category.id} category={section.category} articles={section.articles} layout={section.layout} />
          ))}
        </div>

        <aside className="flex flex-col gap-6" aria-label="Още новини">
          <section className="np-card p-5" aria-labelledby="sec-rubriki">
            <SectionTitle id="sec-rubriki">Рубрики</SectionTitle>
            <CategoryChips categories={menu} />
          </section>
          {asideSections.map((section) => (
            <CompactList key={section.category.id} title={section.category.name} articles={section.articles} href={section.category.path} />
          ))}
        </aside>
      </div>

      <BrandBanner />
    </div>
  );
}
