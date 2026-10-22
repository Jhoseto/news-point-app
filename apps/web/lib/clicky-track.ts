const DOWNLOAD = /\.(?:7z|aac|apk|avi|cab|csv|deb|dmg|doc(?:x|m|b)?|epub|exe|flv|gif|gz|jpe?g|js|m4a|md|mp(?:3|4|e?g)|mobi|mov|msi|ods|pdf|phps|pkg|png|ppt(?:x|m|b)?|rar|rpm|rtf|sea|sit|stl|svgz?|tar|torrent|txt|vcf|web(?:m|p)|wma|wmv|xz|xls(?:x|m|b)?|xml|zip)(?:$|[?#])/i;

type ClickyApi = {
  log: (href: string, title?: string, type?: string) => void;
  video?: (action: string, time: number, href: string, title?: string) => void;
  goal?: (name: string) => void;
};

type YouTubeState = { data: number };
type YouTubePlayer = { getCurrentTime?: () => number; getVideoUrl?: () => string };

type ClickyWindow = Window & {
  clicky?: ClickyApi;
  YT?: {
    Player: new (frame: HTMLIFrameElement, options: { events: { onStateChange: (event: YouTubeState) => void } }) => YouTubePlayer;
    PlayerState?: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number };
  };
  onYouTubeIframeAPIReady?: () => void;
};

export type ClickyLinkAction = "download" | "outbound" | "click";

function api(): ClickyApi | null {
  return (window as ClickyWindow).clicky ?? null;
}

function cleanTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

/** Same link classes and file types as Clicky's own scanner. */
export function clickyLinkAction(href: string, host: string, className: string): ClickyLinkAction | null {
  if (/\bclicky_ignore\b/i.test(className)) return null;
  if (/\bclicky_log_download\b/i.test(className)) return "download";
  if (/\bclicky_log_outbound\b/i.test(className)) return "outbound";
  if (/\bclicky_log\b/i.test(className)) return "click";
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  if (!/^(?:https?|ftp|mailto|tel):$/i.test(url.protocol)) return null;
  if (DOWNLOAD.test(url.pathname)) return "download";
  if (url.protocol === "mailto:" || url.protocol === "tel:" || url.protocol === "ftp:") return "outbound";
  const site = host.replace(/^www\./i, "");
  const linkHost = url.hostname.replace(/^www\./i, "");
  if (!linkHost || linkHost === site) return null;
  return "outbound";
}

export function youtubeTrackingSrc(src: string): string {
  try {
    const url = new URL(src);
    if (!/(?:^|\.)youtube\.com$/i.test(url.hostname) || !url.pathname.startsWith("/embed/")) return src;
    if (url.searchParams.get("enablejsapi") !== "1") url.searchParams.set("enablejsapi", "1");
    return url.href;
  } catch { return src; }
}

function absoluteHttp(href: string): string | null {
  try {
    const url = new URL(href, location.origin);
    return /^https?:$/i.test(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function logClickyMedia(action: "play" | "pause" | "seek" | "end", time: number, href: string, title: string) {
  const video = api()?.video;
  const absolute = absoluteHttp(href);
  if (!video || !absolute) return;
  video(action, Number.isFinite(time) ? Math.max(0, Math.round(time)) : 0, absolute, cleanTitle(title));
}

const sentGoals = new Set<string>();
const pendingGoals: { name: string; key: string }[] = [];

export function logClickyGoal(name: string, key = name) {
  pendingGoals.push({ name, key });
  flushClickyGoals();
}

export function flushClickyGoals() {
  const goal = api()?.goal;
  if (!goal) return;
  for (const item of pendingGoals.splice(0)) {
    const id = `${item.name}\n${item.key}`;
    if (sentGoals.has(id)) continue;
    sentGoals.add(id);
    goal(item.name);
  }
}

function bindDomMedia(root: ParentNode) {
  for (const node of root.querySelectorAll("video, audio")) {
    if (!(node instanceof HTMLMediaElement) || node.dataset.npClickyMedia === "1") continue;
    if (node.autoplay && node.loop) continue;
    node.dataset.npClickyMedia = "1";
    const send = (action: "play" | "pause" | "seek" | "end") => logClickyMedia(action, node.currentTime, node.currentSrc || node.src, node.title || node.getAttribute("aria-label") || "");
    node.addEventListener("play", () => send("play"));
    node.addEventListener("pause", () => send("pause"));
    node.addEventListener("seeked", () => send("seek"));
    node.addEventListener("ended", () => send("end"));
  }
}

const youtubeFrames = new WeakSet<HTMLIFrameElement>();
const vimeoFrames = new WeakSet<HTMLIFrameElement>();

function watchYouTube(frame: HTMLIFrameElement) {
  const tracking = window as ClickyWindow;
  const Player = tracking.YT?.Player;
  if (!Player || youtubeFrames.has(frame)) return;
  youtubeFrames.add(frame);
  const playing = tracking.YT?.PlayerState?.PLAYING ?? 1;
  const paused = tracking.YT?.PlayerState?.PAUSED ?? 2;
  const ended = tracking.YT?.PlayerState?.ENDED ?? 0;
  const buffering = tracking.YT?.PlayerState?.BUFFERING ?? 3;
  let last = -1;
  let player: YouTubePlayer;
  player = new Player(frame, {
    events: {
      onStateChange(event) {
        const time = Math.round(player.getCurrentTime?.() ?? 0);
        const href = player.getVideoUrl?.() || frame.src;
        const title = frame.title || "";
        if (event.data === playing) { if (last !== buffering) logClickyMedia("play", time < 1 ? 0 : time, href, title); }
        else if (event.data === paused) logClickyMedia("pause", time, href, title);
        else if (event.data === ended) logClickyMedia("end", time, href, title);
        last = event.data;
      },
    },
  });
}

function scanYouTube() {
  for (const frame of document.querySelectorAll("iframe")) {
    if (frame instanceof HTMLIFrameElement && /youtube\.com\/embed\//.test(frame.src)) watchYouTube(frame);
  }
}

function ensureYouTubeApi() {
  const tracking = window as ClickyWindow;
  if (tracking.YT?.Player) { scanYouTube(); return; }
  if (!document.getElementById("np-clicky-youtube")) {
    const previous = tracking.onYouTubeIframeAPIReady;
    tracking.onYouTubeIframeAPIReady = () => { previous?.(); scanYouTube(); };
    const script = document.createElement("script");
    script.id = "np-clicky-youtube";
    script.async = true;
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  }
}

function watchVimeo(frame: HTMLIFrameElement) {
  if (vimeoFrames.has(frame)) return;
  vimeoFrames.add(frame);
  const origin = "https://player.vimeo.com";
  const tell = (value: string) => frame.contentWindow?.postMessage(JSON.stringify({ method: "addEventListener", value }), origin);
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== origin || event.source !== frame.contentWindow) return;
    let data: { event?: string; data?: { seconds?: number } } | null = null;
    try { data = typeof event.data === "string" ? JSON.parse(event.data) as { event?: string; data?: { seconds?: number } } : event.data; } catch { return; }
    if (!data) return;
    if (data.event === "ready") for (const name of ["play", "pause", "seeked", "ended"]) tell(name);
    const action = data.event === "play" ? "play" : data.event === "pause" ? "pause" : data.event === "seeked" ? "seek" : data.event === "ended" ? "end" : null;
    if (action) logClickyMedia(action, data.data?.seconds ?? 0, frame.src, frame.title || "");
  };
  window.addEventListener("message", onMessage);
  frame.addEventListener("load", () => { for (const name of ["play", "pause", "seeked", "ended"]) tell(name); }, { once: true });
}

function watchPlayers(root: ParentNode) {
  const youtube = [...root.querySelectorAll("iframe")].filter((frame): frame is HTMLIFrameElement => frame instanceof HTMLIFrameElement && /youtube\.com\/embed\//.test(frame.src));
  const vimeo = [...root.querySelectorAll("iframe")].filter((frame): frame is HTMLIFrameElement => frame instanceof HTMLIFrameElement && frame.src.startsWith("https://player.vimeo.com/"));
  for (const frame of vimeo) watchVimeo(frame);
  if (youtube.length) ensureYouTubeApi();
}

let started = false;

/** Outbound links, downloads, HTML5 media and players that appear after the first page. */
export function startClickyExtras() {
  if (started) {
    bindDomMedia(document);
    watchPlayers(document);
    return;
  }
  started = true;
  flushClickyGoals();
  document.addEventListener("mousedown", event => {
    if (event.button !== 0 && event.button !== 1) return;
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const action = clickyLinkAction(anchor.href, location.hostname, anchor.className);
    if (!action) return;
    api()?.log(anchor.href, cleanTitle(anchor.textContent || anchor.title || ""), action);
  }, true);
  const scan = () => { bindDomMedia(document); watchPlayers(document); };
  scan();
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => { queued = false; scan(); });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
