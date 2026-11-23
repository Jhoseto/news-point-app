import Link from "next/link";
import { HeadphonesIcon } from "./icons";

export function HomePodcastLink({ episode }: { episode: { title: string; path: string; coverUrl?: string | undefined } }) {
  return (
    <nav aria-label="Подкасти на NewsPoint" className="np-home-podcast">
      <Link href={episode.path} prefetch={false} className="np-home-podcast-episode">
        <span className="np-home-podcast-cover">
          <img src={episode.coverUrl ?? "/brand/mark.svg"} alt="" width={72} height={72} loading="lazy" decoding="async" />
        </span>
        <span className="min-w-0">
          <span className="np-home-podcast-label">Последен подкаст</span>
          <span className="np-home-podcast-title">{episode.title}</span>
        </span>
      </Link>
      <Link href="/livepoint/podcast/" prefetch={false} className="np-home-podcast-all">
        <HeadphonesIcon width={16} height={16} /> Всички епизоди
      </Link>
    </nav>
  );
}
