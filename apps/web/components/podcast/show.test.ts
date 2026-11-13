import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PublicEpisode } from "../../lib/podcast-types";
import { PodcastShow } from "./show";

const playback = vi.hoisted(() => ({
  episode: null as PublicEpisode | null, queue: [] as PublicEpisode[], playing: false,
  error: "", rate: 1, volume: 1, sleepMin: null, duration: 60, current: 0, buffered: 0,
}));
vi.mock("./provider", () => ({ usePodcastPlayer: () => playback, PodcastProvider: () => null }));
vi.mock("./timeline", () => ({ PodcastTimeline: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const episodes: PublicEpisode[] = Array.from({ length: 12 }, (_, index) => ({
  id: String(index), slug: `fixture-${index}`, path: `/livepoint/podcast/fixture-${index}/`,
  title: `Тестов епизод ${index}`, summary: `Тестово резюме ${index}. ${"Тестово изречение. ".repeat(8)}Край на епизод ${index}.`,
  publishedAt: "2026-01-01T09:00:00Z", audioUrl: `/podcast-audio/fixture-${index}/`,
  coverUrl: "/media/podcasts/fixture.webp", durationSec: 60, categoryName: null,
}));
beforeEach(() => { vi.stubEnv("__NEXT_TRAILING_SLASH", "true"); playback.episode = null; playback.playing = false; });
afterEach(() => vi.unstubAllEnvs());

it("links the entire archive from a distinct catalogue heading without duplicating long descriptions", () => {
  const html = renderToStaticMarkup(createElement(PodcastShow, { episodes }));
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).toMatch(/<h1\b[^>]*>[\s\S]*?Подкасти на NewsPoint<\/h1>/);
  for (const episode of episodes) {
    expect(html).toContain(`href="${episode.path}"`);
    expect(html).not.toContain(episode.summary);
  }
});

it("keeps the requested title, full summary and play control when a different episode is playing", () => {
  const requested = episodes[11]!;
  playback.episode = episodes[0]!;
  playback.playing = true;
  const html = renderToStaticMarkup(createElement(PodcastShow, { episodes, activeSlug: requested.slug, aboutInitiallyOpen: false }));
  expect(html).toMatch(new RegExp(`<h1[^>]*>${requested.title}</h1>`));
  expect(html).toContain(`<p>${requested.summary}</p>`);
  expect(html).not.toContain(playback.episode.summary);
  expect(html).toContain('class="np-podcast-play" aria-label="Слушай"');
});

it("keeps the catalogue identifiable when no public episodes remain", () => {
  playback.episode = episodes[0]!;
  const html = renderToStaticMarkup(createElement(PodcastShow, { episodes: [] }));
  expect(html).toContain("<h1>Подкасти на NewsPoint</h1>");
  expect(html).not.toContain(episodes[0]!.title);
});

it("keeps a withdrawn episode out of the catalogue when the listener still has it loaded", () => {
  playback.episode = episodes[0]!;
  const html = renderToStaticMarkup(createElement(PodcastShow, { episodes: episodes.slice(1) }));
  expect(html).not.toContain(playback.episode.path);
  expect(html).not.toContain(playback.episode.title);
});
