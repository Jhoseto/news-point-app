import { publicPageMetadata } from "@/lib/public-metadata";
import { getPublishedStoryThemes } from "@/lib/queries";
import { StoryThemeCard } from "@/components/story-theme-card";
import { JsonLd } from "@/components/json-ld";
import { collectionPage } from "@/lib/jsonld";
import { shareOrigin } from "@/lib/share-card";

export const revalidate = 60;

export const metadata = publicPageMetadata("themes");

export default async function StoryThemesIndexPage() {
  const themes = await getPublishedStoryThemes({ limit: 24 });

  return (
    <div className="np-container flex flex-col gap-8 pt-6 pb-12">
      <JsonLd id="np-ld-themes" data={collectionPage({ origin: shareOrigin(), path: "/temi/", title: "Теми с продължение", description: "Редактирани хронологии от обединени новини по тема — от NewsPoint.bg.", items: themes.map((theme) => ({ path: `/temi/${theme.slug}/`, title: theme.title })) })} />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          Теми с продължение
        </h1>
        <p className="max-w-2xl text-base text-muted">
          Обединени новини по тема в ясна хронология — от развитието на събитията до разследванията.
        </p>
      </header>
      {themes.length === 0 ? (
        <p className="np-card p-8 text-center text-sm text-muted">
          Все още няма публикувани теми.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {themes.map((theme) => (
            <StoryThemeCard key={theme.id} theme={theme} />
          ))}
        </div>
      )}
    </div>
  );
}
