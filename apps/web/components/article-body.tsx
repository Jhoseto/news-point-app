import type { Block } from "@newspoint/content";
import type { Media } from "@/lib/queries";
import { ArticleEmbedFrame } from "./article-embed-frame";
import { ExternalIcon } from "./icons";
import { ArticleImage } from "./ui";
import { articleSectionId } from "@/lib/article-reading";

const EMBED_LABEL: Record<string, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  tiktok: "TikTok",
  other: "външен източник",
};

// Stored HTML is sanitized by the importer and re-checked by the block schema.
function BlockView({ block, media, index }: { block: Block; media: Map<string, Media>; index: number }) {
  switch (block.type) {
    case "paragraph":
      return <p id={articleSectionId(index)} dangerouslySetInnerHTML={{ __html: block.html }} />;
    case "heading": {
      const Heading = `h${block.level}` as "h2" | "h3" | "h4";
      return <Heading id={articleSectionId(index)}>{block.text}</Heading>;
    }
    case "image": {
      const asset = media.get(block.mediaAssetId) ?? null;
      const caption = block.caption || asset?.caption;
      const credit = asset?.credit;
      return (
        <figure id={articleSectionId(index)} className={`np-article-figure np-image-${block.size ?? "large"} np-image-align-${block.align ?? "center"} np-image-shape-${block.shape ?? "rectangle"} np-image-frame-${block.frame ?? "none"} np-image-crop-${block.crop ?? "original"}`}>
          <ArticleImage media={asset} sizes="(min-width: 1280px) 760px, (min-width: 768px) 80vw, 100vw" className="w-full rounded-xl" objectPosition={`${block.focalX ?? 50}% ${block.focalY ?? 50}%`} imageTransform={{ scale: (block.cropZoom ?? 100) / 100, origin: `${block.focalX ?? 50}% ${block.focalY ?? 50}%` }} />
          {caption || credit ? <figcaption className="mt-2 text-sm text-muted">{caption}{caption && credit ? " · " : ""}{credit ? `Снимка: ${credit}` : ""}</figcaption> : null}
        </figure>
      );
    }
    case "quote":
      return (
        <blockquote id={articleSectionId(index)} className="np-article-quote">
          <div dangerouslySetInnerHTML={{ __html: block.html }} />
          {block.cite ? <footer className="mt-2 text-sm font-medium text-muted">— {block.cite}</footer> : null}
        </blockquote>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List id={articleSectionId(index)}>
          {block.items.map((item, index) => (
            <li key={index} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </List>
      );
    }
    case "embed":
      return /^https:\/\/(www\.)?(facebook\.com|youtube\.com|youtu\.be|instagram\.com|x\.com|twitter\.com)\//i.test(block.url) ? (
        <ArticleEmbedFrame
          id={articleSectionId(index)}
          src={block.url}
          provider={block.provider}
          title={`Вградено съдържание от ${EMBED_LABEL[block.provider]}`}
        />
      ) : (
        <a id={articleSectionId(index)} href={block.url} target="_blank" rel="noopener noreferrer" className="np-article-embed !no-underline flex items-center justify-between gap-4 px-5 py-4 font-semibold text-ink">
          <span>Виж публикацията в {EMBED_LABEL[block.provider]}</span>
          <ExternalIcon width={18} height={18} />
        </a>
      );
    case "legacy_html":
      return <div id={articleSectionId(index)} className="np-legacy" dangerouslySetInnerHTML={{ __html: block.html }} />;
  }
}

export function ArticleBody({ blocks, media }: { blocks: Block[]; media: Map<string, Media> }) {
  return (
    <div className="np-prose">
      {blocks.map((block, index) => {
        if (block.type === "image" && block.groupId) {
          const first = blocks.findIndex((candidate) => candidate.type === "image" && candidate.groupId === block.groupId);
          if (first !== index) return null;
          const group = blocks.filter((candidate) => candidate.type === "image" && candidate.groupId === block.groupId);
          return <div key={`gallery-${block.groupId}`} className="np-article-gallery">{group.map((item, groupIndex) => <BlockView key={groupIndex} block={item} media={media} index={index + groupIndex} />)}</div>;
        }
        return <BlockView key={index} block={block} media={media} index={index} />;
      })}
    </div>
  );
}
