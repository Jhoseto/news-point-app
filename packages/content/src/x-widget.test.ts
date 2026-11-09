import { afterEach, describe, expect, it, vi } from "vitest";
import { createXPost } from "./x-widget";

afterEach(() => vi.unstubAllGlobals());

describe("X widget loader", () => {
  it("loads the official script and passes only a validated post ID with tracking disabled", async () => {
    const createTweet = vi.fn().mockResolvedValue({});
    const script: { src?: string; async?: boolean; onload?: () => void; onerror?: () => void } = {};
    vi.stubGlobal("window", { twttr: { widgets: { createTweet } } });
    vi.stubGlobal("document", {
      createElement: () => script,
      head: { appendChild: () => script.onload?.() },
    });
    const target = { isConnected: true } as HTMLElement;
    expect(await createXPost(target, "https://twitter.com/TouchlineX/status/218292706224988444?utm_source=test")).toBe(true);
    expect(script.src).toBe("https://platform.x.com/widgets.js");
    expect(createTweet).toHaveBeenCalledWith("218292706224988444", target, { dnt: true });
    expect(await createXPost(target, "https://x.com.evil.test/TouchlineX/status/218292706224988444")).toBe(false);
    expect(createTweet).toHaveBeenCalledTimes(1);
  });
});
