/** Public embed URLs with params suited for in-app iframe preview. */
export function cameraEmbedPlayUrl(embedUrl: string): string {
  if (embedUrl.includes("youtube.com/embed") || embedUrl.includes("youtube-nocookie.com/embed")) {
    const url = new URL(embedUrl.replace("www.youtube.com", "www.youtube-nocookie.com"));
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("mute", "1");
    url.searchParams.set("rel", "0");
    url.searchParams.set("playsinline", "1");
    return url.toString();
  }
  if (embedUrl.includes("rtsp.me/embed")) {
    const url = new URL(embedUrl);
    url.searchParams.set("mute", "1");
    return url.toString();
  }
  return embedUrl;
}
