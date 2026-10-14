/// <reference lib="dom" />

/** React 19 ref callback; only the vetted Reddit frame may resize its canvas. */
export function observeEmbedFrame(frame: HTMLIFrameElement | null): (() => void) | undefined {
  if (!frame || new URL(frame.src).origin !== "https://embed.reddit.com") return;
  const view = frame.ownerDocument.defaultView;
  if (!view) return;
  const canvas = frame.parentElement;
  const resizeCanvas = canvas?.matches(".np-embed-canvas, .np-editor-media-canvas");
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== "https://embed.reddit.com" || event.source !== frame.contentWindow) return;
    let message: unknown = event.data;
    if (typeof message === "string") {
      try { message = JSON.parse(message); } catch { return; }
    }
    if (!message || typeof message !== "object" || !("type" in message) || message.type !== "resize.embed" || !("data" in message)) return;
    const height = message.data;
    if (typeof height !== "number" || !Number.isFinite(height) || height < 200 || height > 2000) return;
    frame.style.height = `${Math.ceil(height)}px`;
    frame.style.aspectRatio = "auto";
    if (resizeCanvas && canvas) {
      canvas.style.aspectRatio = "auto";
      canvas.style.height = frame.style.height;
    }
  };
  view.addEventListener("message", onMessage);
  return () => view.removeEventListener("message", onMessage);
}
