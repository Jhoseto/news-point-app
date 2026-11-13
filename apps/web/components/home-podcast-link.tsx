import Link from "next/link";

export function HomePodcastLink({ episode }: { episode: { title: string; path: string } }) {
  return (
    <nav aria-label="Подкасти на NewsPoint" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-y border-line py-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">Последен подкаст</p>
        <Link href={episode.path} prefetch={false} className="text-lg font-bold text-ink hover:underline">{episode.title}</Link>
      </div>
      <Link href="/livepoint/podcast/" prefetch={false} className="py-2 text-sm font-semibold text-link hover:underline">Всички епизоди</Link>
    </nav>
  );
}
