/** Public embed URLs with params suited for in-app iframe preview. */
export function cameraEmbedPlayUrl(embedUrl: string): string {
  const url = new URL(embedUrl);
  if (["www.youtube.com", "www.youtube-nocookie.com"].includes(url.hostname) && url.pathname.startsWith("/embed/")) {
    url.hostname = "www.youtube-nocookie.com";
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("mute", "1");
    url.searchParams.set("rel", "0");
    url.searchParams.set("playsinline", "1");
    return url.toString();
  }
  if (url.hostname === "webcams.pamporovo.me" && url.pathname.endsWith(".html")) {
    url.searchParams.set("autoplay", "true");
    url.searchParams.set("mute", "true");
    return url.toString();
  }
  if (url.hostname === "player.castr.com") {
    url.searchParams.set("autoplay", "on");
    url.searchParams.set("muted", "on");
    return url.toString();
  }
  // RTSP.ME ignores URL autoplay/mute: its owner setting or the native Play button starts playback.
  return embedUrl;
}
