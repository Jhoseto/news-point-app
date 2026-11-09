"use client";

import { embedFrameUrl, embedAspectRatio, videoSourceUrl, observeEmbedFrame, xPostUrl } from "@newspoint/content";
import { useCookieConsent } from "./cookie-consent-store";
import { youtubeTrackingSrc } from "../lib/clicky-track";
import { ExternalContentConsent } from "./external-content-consent";
import { XPostEmbed } from "./x-post-embed";

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
  const allowed = useCookieConsent().record?.external === true;
  const playSrc = embedFrameUrl(src);
  const xPost = xPostUrl(src);
  const videoSrc = videoSourceUrl(src);
  if ((playSrc || xPost || (videoSrc && !videoSrc.startsWith("/"))) && !allowed) return <ExternalContentConsent id={id} title={title} sourceUrl={src} className={className} />;
  if (videoSrc) return <video id={id} src={videoSrc} controls preload="metadata" playsInline className={`${className} np-native-video`} aria-label={title} />;
  if (xPost) return <XPostEmbed src={xPost} id={id} className={className} />;
  if (!playSrc) return <a id={id} className={className} href={src} target="_blank" rel="noopener noreferrer">Виж публикацията в {provider}</a>;
  return (
    <div id={id} className={`${className} np-embed-canvas`} style={{ aspectRatio: embedAspectRatio(src) }}>
      <iframe
        ref={observeEmbedFrame}
        src={youtubeTrackingSrc(playSrc)}
        title={title}
        loading={provider === "facebook" ? "eager" : "lazy"}
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
