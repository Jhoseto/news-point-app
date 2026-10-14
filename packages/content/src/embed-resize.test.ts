import { describe, expect, it, vi } from "vitest";
import { observeEmbedFrame } from "./embed-resize";

function fixture(resizeCanvas = true) {
  let listener: ((event: MessageEvent) => void) | undefined;
  const view = {
    addEventListener: vi.fn((_type: string, callback: (event: MessageEvent) => void) => { listener = callback; }),
    removeEventListener: vi.fn(),
  };
  const canvas = { matches: () => resizeCanvas, style: { height: "", aspectRatio: "4/5" } };
  const frame = { src: "https://embed.reddit.com/r/aww/comments/crpjwk/title/", contentWindow: {}, ownerDocument: { defaultView: view }, parentElement: canvas, style: { height: "", aspectRatio: "" } };
  const cleanup = observeEmbedFrame(frame as unknown as HTMLIFrameElement);
  const send = (data: unknown, origin = "https://embed.reddit.com", source: unknown = frame.contentWindow) => listener?.({ data, origin, source } as MessageEvent);
  return { frame, canvas, view, cleanup, send };
}

describe("Reddit embed resize", () => {
  it("uses the real provider's height and cleans up when the frame unmounts", () => {
    const { frame, canvas, view, cleanup, send } = fixture();
    send(JSON.stringify({ type: "resize.embed", data: 648.5 }));
    expect(frame.style.height).toBe("649px");
    expect(canvas.style).toEqual({ height: "649px", aspectRatio: "auto" });
    cleanup?.();
    expect(view.removeEventListener).toHaveBeenCalledWith("message", expect.any(Function));
  });
  it("rejects messages from another origin/frame, malformed data and unreasonable heights", () => {
    const { frame, send } = fixture();
    send({ type: "resize.embed", data: 600 }, "https://evil.test");
    send({ type: "resize.embed", data: 600 }, "https://embed.reddit.com", {});
    for (const data of [null, "broken JSON", { type: "unrelated", data: 600 }, ...[0, -1, 199, 2001, Infinity, NaN, "600", {}].map(data => ({ type: "resize.embed", data }))]) send(data);
    expect(frame.style.height).toBe("");
  });
  it("does not touch other providers or a surrounding hero layout", () => {
    expect(observeEmbedFrame(null)).toBeUndefined();
    const { frame, canvas, send, cleanup } = fixture(false);
    send({ type: "resize.embed", data: 600 });
    expect(frame.style.height).toBe("600px");
    expect(canvas.style.height).toBe("");
    cleanup?.();
    frame.src = "https://www.youtube.com/embed/dQw4w9WgXcQ";
    expect(observeEmbedFrame(frame as unknown as HTMLIFrameElement)).toBeUndefined();
  });
});
