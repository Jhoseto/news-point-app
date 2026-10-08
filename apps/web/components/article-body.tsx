import { bodyGroups, composition, embedFrameUrl, EMBED_PROVIDER_LABEL, type Block } from "@newspoint/content";
import type { Media } from "@/lib/queries";
import { ArticleEmbedFrame } from "./article-embed-frame";
import { ExternalIcon } from "./icons";
import { ArticleImage } from "./ui";
import { articleSectionId } from "@/lib/article-reading";
import "@newspoint/content/composition.css";

// Stored HTML is sanitized by the importer and re-checked by the block schema.
function BlockView({ block, media, index }: { block: Block; media: Map<string, Media>; index: number }) {
  const layout = composition(block);
  switch (block.type) {
    case "paragraph":
      return <p id={articleSectionId(index)} className={layout.className} style={layout.style} dangerouslySetInnerHTML={{ __html: block.html }} />;
    case "heading": {
      const Heading = `h${block.level}` as "h2" | "h3" | "h4";
      return <Heading id={articleSectionId(index)} className={layout.className} style={layout.style} dangerouslySetInnerHTML={{ __html: block.html ?? block.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }} />;
    }
    case "image": {
      const asset = media.get(block.mediaAssetId) ?? null;
      const caption = block.caption ?? asset?.caption;
      const credit = asset?.credit;
      const custom = block.widthPercent !== undefined || block.wrap !== undefined;
      const imageLayout = custom ? layout : { className: "", style: {} };
      const image = <ArticleImage media={asset ? { ...asset, alt: block.alt ?? asset.alt } : null} sizes="(min-width: 1280px) 760px, (min-width: 768px) 80vw, 100vw" className="w-full rounded-xl" objectPosition={`${block.focalX ?? 50}% ${block.focalY ?? 50}%`} imageTransform={{ scale: (block.cropZoom ?? 100) / 100, origin: `${block.focalX ?? 50}% ${block.focalY ?? 50}%` }} />;
      return (
        <figure id={articleSectionId(index)} style={imageLayout.style} className={`${imageLayout.className} np-article-figure np-image-${block.size ?? "large"} np-image-align-${block.align ?? "center"} np-image-shape-${block.shape ?? "rectangle"} np-image-frame-${block.frame ?? "none"} np-image-crop-${block.crop ?? "original"}`}>
          {custom ? <div className={`np-media-canvas frame-${block.frame ?? "none"}`} style={{ aspectRatio: block.shape === "circle" ? "1" : { square: "1", portrait: "4/5", landscape: "16/9", original: asset?.width && asset?.height ? `${asset.width}/${asset.height}` : undefined }[block.crop ?? "original"], borderRadius: block.shape === "circle" ? "50%" : block.shape === "rounded" ? "1rem" : undefined }}>
          {image}</div> : image}
          {caption || credit ? <figcaption className="mt-2 text-sm text-muted">{caption}{caption && credit ? " · " : ""}{credit ? `Снимка: ${credit}` : ""}</figcaption> : null}
        </figure>
      );
    }
    case "quote":
      return (
        <blockquote id={articleSectionId(index)} className={`np-article-quote ${layout.className}`} style={layout.style}>
          <div dangerouslySetInnerHTML={{ __html: block.html }} />
          {block.cite ? <footer className="mt-2 text-sm font-medium text-muted">— {block.cite}</footer> : null}
        </blockquote>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List id={articleSectionId(index)} className={layout.className} style={layout.style}>
          {block.items.map((item, index) => (
            <li key={index} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </List>
      );
    }
    case "embed":
      return embedFrameUrl(block.url) ? (
        <div className={layout.className} style={layout.style}>
        <ArticleEmbedFrame
          id={articleSectionId(index)}
          src={block.url}
          provider={block.provider}
          title={`Вградено съдържание от ${EMBED_PROVIDER_LABEL[block.provider]}`}
        /></div>
      ) : (
        <a id={articleSectionId(index)} href={block.url} style={layout.style} target="_blank" rel="noopener noreferrer" className={`${layout.className} np-article-embed np-embed-link !no-underline flex items-center justify-between gap-4 px-5 py-4 font-semibold text-ink`}>
          <span>Виж публикацията в {EMBED_PROVIDER_LABEL[block.provider]}</span>
          <ExternalIcon width={18} height={18} />
        </a>
      );
    case "legacy_html":
      return <div id={articleSectionId(index)} className="np-legacy" dangerouslySetInnerHTML={{ __html: block.html }} />;
    case "divider": return <hr id={articleSectionId(index)} />;
  }
}

export function ArticleBody({ blocks, media }: { blocks: Block[]; media: Map<string, Media> }) {
  return (
    <div className="np-prose">
      {bodyGroups(blocks).map(group => group.blocks.length > 1 ? <div key={group.index} className="np-article-gallery">{group.blocks.map((block, offset) => <BlockView key={offset} block={block} media={media} index={group.index + offset} />)}</div> : <BlockView key={group.index} block={group.blocks[0]!} media={media} index={group.index} />)}
    </div>
  );
}
