import Link from "next/link";
import type { ReactNode } from "react";

export function PodcastPageShell({ title, children }: { title?: string; children: ReactNode }) {
  return <div className="np-podcast-page np-podcast-theater-page">
    <nav className="np-podcast-breadcrumb" aria-label="Навигация"><Link href="/">Начало</Link><span>/</span>{title ? <><Link href="/livepoint/podcast/">NewsPodcast</Link><span>/</span><span>Епизод</span></> : <span>NewsPodcast</span>}</nav>
    {children}
  </div>;
}
