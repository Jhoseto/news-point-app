import Link from "next/link";
import { ArticleImage } from "@/components/ui";
import type { CityStory } from "@/lib/city-guide/news";
import "./city-related-news.css";

export function CityRelatedNews({ stories, topic, compact = false }: { stories: CityStory[]; topic: string; compact?: boolean }) {
  if (!stories.length) return null;
  return <aside className={`city-related-news${compact ? " city-related-compact" : ""}`} aria-label={`Новини: ${topic}`}>
    <header><div><span>NEWSPOINT / ОЩЕ КОНТЕКСТ</span><h2>{topic}</h2></div><span className="city-related-rule" aria-hidden="true" /></header>
    <div className="city-related-grid">{stories.map(story => <Link className={`city-related-card${story.hero ? "" : " city-related-text"}`} key={story.path} href={story.path} prefetch={false}>
      {story.hero ? <div className="city-related-photo"><ArticleImage media={{ ...story.hero, alt: "" }} sizes="(max-width: 700px) 80vw, 320px" /></div> : null}
      <div className="city-related-copy"><time dateTime={story.publishedAt}>{new Date(story.publishedAt).toLocaleDateString("bg-BG", { day: "numeric", month: "long", year: "numeric" })}</time><h3>{story.title}</h3><span className="city-related-read">Прочети историята <span aria-hidden="true">↗</span></span></div>
    </Link>)}</div>
  </aside>;
}
