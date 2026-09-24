import type { Block } from "@newspoint/content";
import type { Media } from "@/lib/queries";
import { ExternalIcon } from "./icons";
import { ArticleImage } from "./ui";

const EMBED_LABEL: Record<string, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  tiktok: "TikTok",
  other: "външен източник",
};

// Stored HTML is sanitized by the importer and re-checked by the block schema.
function BlockView({ block, media }: { block: Block; media: Map<string, Media> }) {
  switch (block.type) {
    case "paragraph":
      return <p dangerouslySetInnerHTML={{ __html: block.html }} />;
    case "heading": {
      const Heading = `h${block.level}` as "h2" | "h3" | "h4";
      return <Heading>{block.text}</Heading>;
    }
    case "image": {
      const asset = media.get(block.mediaAssetId) ?? null;
      const caption = block.caption || asset?.caption;
      return (
        <figure className="!mt-8 !mb-8">
          <ArticleImage media={asset} sizes="(min-width: 1024px) 720px, 100vw" className="w-full rounded-2xl" />
          {caption ? <figcaption className="mt-2 text-sm text-muted">{caption}</figcaption> : null}
        </figure>
      );
    }
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
    case "embed":
      return (
        <a
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="!no-underline flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface-2 px-5 py-4 font-semibold text-ink"
        >
          <span>Виж публикацията в {EMBED_LABEL[block.provider]}</span>
          <ExternalIcon width={18} height={18} />
        </a>
      );
    case "legacy_html":
      return <div className="np-legacy" dangerouslySetInnerHTML={{ __html: block.html }} />;
  }
}

export function ArticleBody({ blocks, media }: { blocks: Block[]; media: Map<string, Media> }) {
  return (
    <div className="np-prose">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} media={media} />
      ))}
    </div>
  );
}
