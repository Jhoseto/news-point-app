import type { Block } from "@newspoint/content";
import type { MediaOption } from "@/lib/articles";
import { wordCount } from "@/lib/editor/body";
import { formatFull } from "@/lib/format";
import { BrandLogoImg } from "@/components/brand-logo-img";
import { withBase } from "@/lib/paths";

// Mirrors the article page of apps/web (components/article-page.tsx, article-body.tsx)
// so editors see the text the way readers will. Keep the two in step.

export type PreviewTheme = "light" | "dark";

export interface PreviewArticle {
  title: string;
  excerpt: string;
  blocks: Block[];
  category: string | null;
  hero: MediaOption | null;
  authorName: string;
  /** Null until published; the preview then shows the current time. */
  publishedAt: string | null;
  media: MediaOption[];
}

function PreviewBlock({ block, media }: { block: Block; media: MediaOption[] }) {
  switch (block.type) {
    case "paragraph":
      return <p dangerouslySetInnerHTML={{ __html: block.html }} />;
    case "heading":
      return block.level === 2 ? <h2>{block.text}</h2> : block.level === 3 ? <h3>{block.text}</h3> : <h4>{block.text}</h4>;
    case "quote":
      return (
        <blockquote className="relative rounded-2xl border border-line bg-surface-2 px-6 py-5 text-lg leading-relaxed font-semibold text-ink">
          <span className="np-gradient-bg absolute inset-y-4 left-0 w-1 rounded-full" aria-hidden="true" />
          <div dangerouslySetInnerHTML={{ __html: block.html }} />
          {block.cite ? <footer className="mt-2 text-sm font-medium text-muted">— {block.cite}</footer> : null}
        </blockquote>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List>
          {block.items.map((item, index) => (
            <li key={index} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </List>
      );
    }
    case "image": {
      const asset = media.find((item) => item.id === block.mediaAssetId);
      return asset ? <figure className={`studio-preview-image is-${block.shape ?? "rectangle"} is-${block.size ?? "large"} is-${block.frame ?? "none"} is-crop-${block.crop ?? "original"}`}><img src={asset.url} alt={asset.alt} style={{ objectPosition: `${block.focalX ?? 50}% ${block.focalY ?? 50}%` }} /><figcaption>{asset.alt}</figcaption></figure> : null;
    }
    default:
      return <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">Елемент „{block.type}“ се вижда само на сайта.</p>;
  }
}

function readingMinutes(blocks: Block[]): number {
  const text = blocks
    .map((block) => (block.type === "heading" ? block.text : "html" in block ? block.html.replace(/<[^>]+>/g, " ") : ""))
    .join(" ");
  return Math.max(1, Math.round(wordCount(text) / 200));
}

export function ArticlePreview({ article, theme }: { article: PreviewArticle; theme: PreviewTheme }) {
  const hasBody = article.blocks.length > 0;
  return (
    <div data-theme={theme} className="np-site @container min-h-full bg-page font-sans text-body">
      <header className="border-b border-line bg-surface/90">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 px-4 @2xl:h-16 @2xl:px-6">
          <BrandLogoImg className="h-8 w-auto @2xl:h-9" />
          <span className="np-gradient-bg ml-auto h-1 w-16 rounded-full opacity-70" aria-hidden="true" />
        </div>
      </header>

      <article className="mx-auto max-w-[1320px] px-4 pt-5 pb-12 @2xl:px-6">
        {article.category ? (
          <p className="mb-4 text-xs font-medium text-muted">
            Начало <span className="text-faint">/</span> {article.category}
          </p>
        ) : null}
        <div className="relative overflow-hidden rounded-3xl shadow-card">
          {article.hero ? (
            <img src={article.hero.url} alt={article.hero.alt} className="aspect-[16/9] w-full bg-surface-2 object-cover" />
          ) : (
            <div className="flex aspect-[16/9] w-full items-center justify-center bg-surface-2 text-sm font-semibold text-faint">Основна снимка</div>
          )}
          {article.category ? (
            <span className="absolute top-4 left-4 inline-flex items-center rounded-full bg-accent px-2.5 py-1 text-[0.6875rem] font-bold tracking-wide text-white uppercase">
              {article.category}
            </span>
          ) : null}
        </div>

        <div className="mx-auto mt-6 flex max-w-[46rem] flex-col gap-5">
          <h1 className={`text-[1.75rem] leading-[1.15] font-extrabold tracking-tight text-balance @xl:text-4xl @4xl:text-[2.6rem] ${article.title ? "text-ink" : "text-faint"}`}>
            {article.title || "Заглавието на материала"}
          </h1>
          {article.excerpt ? <p className="text-lg leading-relaxed text-body">{article.excerpt}</p> : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-3 text-xs font-medium text-muted">
            <span className="inline-flex items-center gap-2 font-bold text-ink">
              <span className="np-ring !size-5" aria-hidden="true" />
              {article.authorName}
            </span>
            <span className="inline-flex items-center gap-1" suppressHydrationWarning>
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              {formatFull(article.publishedAt ?? new Date())}
            </span>
            <span className="inline-flex items-center gap-1">
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
                <path d="M4 19a2 2 0 0 1 2-2h13" />
              </svg>
              {readingMinutes(article.blocks)} мин. четене
            </span>
          </div>

          {hasBody ? (
            <div className="np-prose np-site-prose">
              {article.blocks.map((block, index) => {
                if (block.type === "image" && block.groupId) {
                  const first = article.blocks.findIndex((candidate) => candidate.type === "image" && candidate.groupId === block.groupId);
                  if (first !== index) return null;
                  const group = article.blocks.filter((candidate) => candidate.type === "image" && candidate.groupId === block.groupId);
                  return <div key={`preview-gallery-${block.groupId}`} className="studio-preview-gallery">{group.map((item, groupIndex) => <PreviewBlock key={groupIndex} block={item} media={article.media} />)}</div>;
                }
                return <PreviewBlock key={index} block={block} media={article.media} />;
              })}
            </div>
          ) : (
            <p className="rounded-2xl border-2 border-dashed border-line px-5 py-10 text-center text-sm text-faint">Текстът ще се появи тук, докато пишете.</p>
          )}
        </div>
      </article>
    </div>
  );
}
