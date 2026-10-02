import { PUBLIC_MENU } from "@newspoint/content";
import { listPodcastCategories, listStudioPodcasts, podcastsReady } from "@newspoint/db/podcasts";
import { type StudioEpisode } from "@/components/podcast-desk";
import { PodcastWorkspace } from "@/components/podcast-workspace";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Подкасти" };
export const dynamic = "force-dynamic";

export default async function PodcastsPage() {
  await requireStaff();
  if (!await podcastsReady()) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h1 className="text-xl font-extrabold text-ink">Подкасти</h1>
        <p className="mt-3 text-sm">Панелът е готов. Приложете <strong>22_podcasts.sql</strong> и презаредете страницата.</p>
      </section>
    );
  }
  const menu = await listPodcastCategories(PUBLIC_MENU.map((entry) => entry.slug));
  const bySlug = new Map(PUBLIC_MENU.map((entry) => [entry.slug, entry.name]));
  const rows = await listStudioPodcasts();
  const episodes: StudioEpisode[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    coverKey: row.coverKey,
    durationSec: row.durationSec,
    bytes: row.bytes,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    status: row.status,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  }));
  return (
    <section>
      <h1 className="mb-4 text-xl font-extrabold text-ink">Подкасти</h1>
      <PodcastWorkspace
        initial={episodes}
        categories={menu.map((category) => ({ id: category.id, name: bySlug.get(category.slug) ?? category.name }))}
        webUrl={(process.env.WEB_URL ?? "http://localhost:3000").replace(/\/+$/, "")}
      />
    </section>
  );
}
