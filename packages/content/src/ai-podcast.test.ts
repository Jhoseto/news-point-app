import { describe, expect, it } from "vitest";
import { aiPodcastSettings, articleText, targetWords, transcript, type AiPodcastSettings } from "./ai-podcast";

const settings: AiPodcastSettings = { articleIds: ["550e8400-e29b-41d4-a716-446655440001", "550e8400-e29b-41d4-a716-446655440002", "550e8400-e29b-41d4-a716-446655440003"], minutes: 10, style: "natural", introMode: "automatic", intro: "", direction: "", music: "none", categoryId: null };

describe("AI podcast input", () => {
  it("requires three distinct published article IDs and exact intro text when selected", () => {
    expect(aiPodcastSettings.safeParse(settings).success).toBe(true);
    expect(aiPodcastSettings.safeParse({ ...settings, articleIds: settings.articleIds.slice(0, 2) }).success).toBe(false);
    expect(aiPodcastSettings.safeParse({ ...settings, articleIds: [settings.articleIds[0], settings.articleIds[0], settings.articleIds[2]] }).success).toBe(false);
    expect(aiPodcastSettings.safeParse({ ...settings, introMode: "exact" }).success).toBe(false);
    expect(aiPodcastSettings.safeParse({ ...settings, introMode: "exact", intro: "Добро утро" }).success).toBe(true);
  });

  it("extracts only text from article blocks and keeps transcript free of vocal tags", () => {
    expect(articleText([{ type: "heading", level: 2, text: "Новина" }, { type: "paragraph", html: "<p>Факт <strong>едно</strong>.</p>" }, { type: "image", mediaAssetId: "550e8400-e29b-41d4-a716-446655440001", caption: "Снимка" }])).toBe("Новина\n\nФакт едно .\n\nСнимка");
    expect(transcript([{ id: settings.articleIds[0]!, sourceId: null, label: "Увод", lines: [{ speaker: "alex", text: "Добро утро", direction: "", spoken: "<breath> Добро утро" }], wavKey: null, version: 1 }])).toContain("Алекс: Добро утро");
    expect(targetWords(settings)).toBe(1300);
  });
});
