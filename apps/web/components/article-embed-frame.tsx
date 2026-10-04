import { articleEmbedPlayUrl } from "@/lib/article-embed-url";

export function ArticleEmbedFrame({
  src,
  title,
  provider,
  id,
  className = "np-article-embed-frame",
}: {
  src: string;
  title: string;
  provider: string;
  id?: string;
  className?: string;
}) {
  const playSrc = articleEmbedPlayUrl(src, provider);
  return (
    <div id={id} className={className}>
      <iframe
        src={playSrc}
        title={title}
        loading={provider === "facebook" ? "eager" : "lazy"}
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
