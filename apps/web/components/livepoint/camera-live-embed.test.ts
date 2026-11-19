import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CameraLiveEmbed } from "./camera-live-embed";

const consent = vi.hoisted(() => ({ record: undefined as { external: boolean } | undefined }));
vi.mock("../cookie-consent-store", () => ({ useCookieConsent: () => consent, openCookieSettings: vi.fn() }));

const videoUrl = "https://webcams.pamporovo.me/e3b8e6e7-406a-4b68-ac23-5cd82fc6437b.html";
const snapshotUrl = "https://www.banskoski.com/ext/webcams/livecam-5.jpg";
const sourceUrl = "https://example.com/source-page";

function render(embedUrl = videoUrl, kind?: "iframe" | "snapshot") {
  return renderToStaticMarkup(createElement(CameraLiveEmbed, {
    title: "Тестова публична камера", embedUrl, sourceUrl, ...(kind ? { kind } : {}),
  }));
}

beforeEach(() => { consent.record = undefined; });

describe("camera external-content consent", () => {
  it.each([undefined, false])("does not load any external media or provide outgoing links without explicit consent (%s)", (external) => {
    consent.record = external === undefined ? undefined : { external };
    for (const embedUrl of [videoUrl, snapshotUrl]) {
      const html = render(embedUrl);
      expect(html).not.toMatch(/<(?:iframe|img|video|audio|source|link)\b/i);
      expect(html).not.toMatch(/<a\b/i);
      expect(html).not.toContain(embedUrl);
      expect(html).not.toContain(sourceUrl);
      expect(html).toContain("Настройки за бисквитки");
      expect(html).toMatch(/<button\b[^>]*type="button"/);
    }
  });

  it("renders the official player in-place after consent without a source-page link", () => {
    consent.record = { external: true };
    const html = render();
    expect(html.match(/<iframe\b/g)).toHaveLength(1);
    expect(html).toContain(`src="${videoUrl}?autoplay=true&amp;mute=true"`);
    expect(html).toContain('title="Тестова публична камера"');
    expect(html).toContain('allow="autoplay; fullscreen; encrypted-media; picture-in-picture"');
    expect(html).not.toMatch(/<(?:img|a)\b/i);
    expect(html).not.toContain(sourceUrl);
    expect(html).toContain("Презареди");
  });

  it("retains the whole snapshot and its timestamp instead of cropping it to the video ratio", () => {
    consent.record = { external: true };
    const html = render(snapshotUrl);
    const image = html.match(/<img\b[^>]*>/)?.[0];
    expect(image).toBeDefined();
    expect(image).toContain(`src="${snapshotUrl}"`);
    expect(image).toContain("object-contain");
    expect(image).not.toContain("object-cover");
    expect(html).not.toMatch(/<(?:iframe|a)\b/i);
    expect(html).not.toContain(sourceUrl);
    expect(html).toContain("Обновявани снимки");
  });

  it("uses image playback for an explicitly classified snapshot even without a JPEG suffix", () => {
    consent.record = { external: true };
    const html = render("https://example.com/camera/latest", "snapshot");
    expect(html).toMatch(/<img\b[^>]*src="https:\/\/example\.com\/camera\/latest"/);
    expect(html).not.toMatch(/<(?:iframe|a)\b/i);
  });
});
