import { articleSubtitle, bodyGroups, composition, embedFrameUrl, type Block } from "@newspoint/content";
import type { MediaOption } from "@/lib/articles";
import { wordCount } from "@/lib/editor/body";
import { formatFull } from "@/lib/format";
import { browserMediaSrc } from "@/lib/media-src";
import { BrandLogoImg } from "@/components/brand-logo-img";
import { withBase } from "@/lib/paths";
import "@newspoint/content/composition.css";

// Mirrors the article page of apps/web (components/article-page.tsx, article-body.tsx)
// so editors see the text the way readers will. Keep the two in step.

export type PreviewTheme = "light" | "dark";

export interface PreviewArticle {
  title: string;
  excerpt: string;
  blocks: Block[];
  category: string | null;
  hero: MediaOption | null;
  heroEmbedUrl: string | null;
  authorName: string;
  /** Null until published; the preview then shows the current time. */
  publishedAt: string | null;
  media: MediaOption[];
}

function PreviewBlock({ block, media }: { block: Block; media: MediaOption[] }) {
  const layout = composition(block);
  switch (block.type) {
    case "paragraph":
      return <p className={layout.className} style={layout.style} dangerouslySetInnerHTML={{ __html: block.html }} />;
    case "heading":
      { const Heading = `h${block.level}` as "h2" | "h3" | "h4"; return <Heading className={layout.className} style={layout.style} dangerouslySetInnerHTML={{ __html: block.html ?? block.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }} />; }
    case "quote":
      return (
        <blockquote style={layout.style} className={`${layout.className} relative rounded-2xl border border-line bg-surface-2 px-6 py-5 text-lg leading-relaxed font-semibold text-ink`}>
          <span className="np-gradient-bg absolute inset-y-4 left-0 w-1 rounded-full" aria-hidden="true" />
          <div dangerouslySetInnerHTML={{ __html: block.html }} />
          {block.cite ? <footer className="mt-2 text-sm font-medium text-muted">— {block.cite}</footer> : null}
        </blockquote>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List className={layout.className} style={layout.style}>
          {block.items.map((item, index) => (
            <li key={index} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </List>
      );
    }
    case "image": {
      const asset = media.find((item) => item.id === block.mediaAssetId);
      const caption = block.caption ?? asset?.caption;
      return asset ? <figure style={layout.style} className={`${layout.className} studio-preview-image is-${block.shape ?? "rectangle"} is-${block.size ?? "large"} is-${block.align ?? "center"} is-${block.frame ?? "none"} is-crop-${block.crop ?? "original"}`}><div className="np-media-canvas" style={{ aspectRatio: block.shape === "circle" ? "1" : { square: "1", portrait: "4/5", landscape: "16/9", original: asset.width && asset.height ? `${asset.width}/${asset.height}` : undefined }[block.crop ?? "original"], borderRadius: block.shape === "circle" ? "50%" : block.shape === "rounded" ? "1rem" : undefined }}><img src={browserMediaSrc(asset.url)} alt={block.alt ?? asset.alt} style={{ objectPosition: `${block.focalX ?? 50}% ${block.focalY ?? 50}%`, transform: `scale(${(block.cropZoom ?? 100) / 100})`, transformOrigin: `${block.focalX ?? 50}% ${block.focalY ?? 50}%` }} /></div>{caption || asset.credit ? <figcaption>{caption}{caption && asset.credit ? " · " : ""}{asset.credit ? `Снимка: ${asset.credit}` : ""}</figcaption> : null}</figure> : null;
    }
    case "embed":
      return <div className={`${layout.className} studio-preview-embed`} style={layout.style}>{embedFrameUrl(block.url) ? <iframe src={embedFrameUrl(block.url)!} title={`Вградено съдържание от ${block.provider}`} loading="lazy" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowFullScreen /> : <a href={block.url} target="_blank" rel="noopener noreferrer">Виж публикацията в {block.provider}</a>}</div>;
    case "divider": return <hr />;
    case "legacy_html": return <div className="np-legacy" dangerouslySetInnerHTML={{ __html: block.html }} />;
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
  const subtitle = articleSubtitle(article.excerpt, article.blocks);
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
          {article.heroEmbedUrl ? (
            embedFrameUrl(article.heroEmbedUrl) ? <iframe src={embedFrameUrl(article.heroEmbedUrl)!} title="Вградено hero съдържание" className="aspect-[16/9] w-full border-0 bg-surface-2" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowFullScreen /> : <a href={article.heroEmbedUrl} target="_blank" rel="noopener noreferrer">Виж водещата публикация</a>
          ) : article.hero ? (
            <img src={browserMediaSrc(article.hero.url)} alt={article.hero.alt} className="aspect-[16/9] w-full bg-surface-2 object-cover" />
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
          {subtitle ? <p className="text-lg leading-relaxed text-body">{subtitle}</p> : null}

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
              {bodyGroups(article.blocks).map(group => group.blocks.length > 1 ? <div key={group.index} className="np-article-gallery studio-preview-gallery">{group.blocks.map((block, offset) => <PreviewBlock key={offset} block={block} media={article.media} />)}</div> : <PreviewBlock key={group.index} block={group.blocks[0]!} media={article.media} />)}
            </div>
          ) : (
            <p className="rounded-2xl border-2 border-dashed border-line px-5 py-10 text-center text-sm text-faint">Текстът ще се появи тук, докато пишете.</p>
          )}
        </div>
      </article>
    </div>
  );
}
