import { describe, expect, it } from "vitest";
import { cameraEmbedPlayUrl } from "./embed-play-url";

describe("camera embed playback URLs", () => {
  it.each(["www.youtube.com", "www.youtube-nocookie.com"])("uses the privacy player and supported parameters for %s", (hostname) => {
    const result = new URL(cameraEmbedPlayUrl(`https://${hostname}/embed/fixture-live?autoplay=0&mute=0&rel=1&start=12#player`));
    expect(result.hostname).toBe("www.youtube-nocookie.com");
    expect(result.pathname).toBe("/embed/fixture-live");
    expect(Object.fromEntries(result.searchParams)).toEqual({ autoplay: "1", mute: "1", rel: "0", start: "12", playsinline: "1" });
    expect(result.hash).toBe("#player");
  });

  it("uses the boolean parameters understood by the official Pamporovo player", () => {
    const result = new URL(cameraEmbedPlayUrl("https://webcams.pamporovo.me/fixture.html?autoplay=false&mute=false&color=ffffff"));
    expect(result.origin).toBe("https://webcams.pamporovo.me");
    expect(result.pathname).toBe("/fixture.html");
    expect(Object.fromEntries(result.searchParams)).toEqual({ autoplay: "true", mute: "true", color: "ffffff" });
  });

  it("does not append ineffective autoplay or mute parameters to RTSP.ME", () => {
    const original = "https://rtsp.me/embed/fixture-public/?theme=dark#player";
    expect(cameraEmbedPlayUrl(original)).toBe(original);
  });

  it("explicitly starts Castr muted without depending on the owner's default", () => {
    const result = new URL(cameraEmbedPlayUrl("https://player.castr.com/fixture?autoplay=off&muted=off&controls=on"));
    expect(Object.fromEntries(result.searchParams)).toEqual({ autoplay: "on", muted: "on", controls: "on" });
  });

  it.each([
    "https://www.youtube.com.evil.example/embed/fixture",
    "https://video.example/embed/fixture?provider=www.youtube.com",
    "https://webcams.pamporovo.me.evil.example/fixture.html",
    "https://player.castr.com.evil.example/fixture",
    "https://video.example/webcams.pamporovo.me/fixture.html",
    "https://www.youtube.com/watch?v=fixture",
    "https://webcams.pamporovo.me/memfs/fixture.m3u8",
    "https://www.banskoski.com/ext/webcams/livecam-5.jpg?t=123",
  ])("leaves unrelated hosts, source pages and image URLs unchanged: %s", (original) => {
    expect(cameraEmbedPlayUrl(original)).toBe(original);
  });
});
