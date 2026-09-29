import { describe, expect, it } from "vitest";
import { rankArticleRecommendations, recommendationTerms } from "./article-recommendations";
import type { ArticleSummary } from "./queries";

const category = { id: "sport", slug: "sport", name: "Спорт", path: "/sport/" };
const now = new Date("2026-09-29T12:00:00Z");
const story = (id: string, title: string, publishedAt: string, excerpt = "", categoryOverride = category): ArticleSummary => ({
  id, title, excerpt, publishedAt: new Date(publishedAt), category: categoryOverride, path: `/${id}/`, authorName: "NewsPoint.bg", hero: null,
});

describe("article recommendations", () => {
  const current = story("current", "Локомотив Пловдив привлече нов нападател от Бразилия", "2026-09-29T10:00:00Z", "Клубът представи Жоао Силва на Лаута");

  it("removes generic Bulgarian news words from the anchors", () => {
    expect(recommendationTerms("Нова новина от България: Локомотив привлече Жоао Силва")).toEqual(["локомотив", "привлече", "жоао", "силва"]);
  });

  it("prefers a directly related older story over a loose fresh rubric item", () => {
    const result = rankArticleRecommendations(current, [
      story("fresh", "Отборът започна тренировка преди мача", "2026-09-28T10:00:00Z", "Футболистите тренираха в Пловдив"),
      story("older", "Локомотив Пловдив преговаря с нападателя Жоао Силва", "2025-11-10T10:00:00Z", "Бразилецът може да пристигне на Лаута"),
    ], { now });
    expect(result.map(({ id }) => id)).toEqual(["older"]);
  });

  it("does not admit an old item merely because it shares the rubric", () => {
    const result = rankArticleRecommendations(current, [
      story("unrelated", "Волейболният шампион започва подготовка", "2024-01-10T10:00:00Z"),
    ], { now });
    expect(result).toEqual([]);
  });

  it("allows a very old background story only with strong direct anchors", () => {
    const result = rankArticleRecommendations(current, [
      story("background", "Локомотив Пловдив следи нападателя Жоао Силва", "2021-02-10T10:00:00Z", "Бразилия и Лаута"),
    ], { now });
    expect(result.map(({ id }) => id)).toEqual(["background"]);
  });

  it("excludes neighbours and near-duplicate headlines", () => {
    const result = rankArticleRecommendations(current, [
      story("neighbour", "Локомотив Пловдив представи нападателя Жоао Силва", "2026-09-29T11:00:00Z"),
      story("a", "Локомотив Пловдив подписа с Жоао Силва", "2026-09-27T11:00:00Z", "Новият нападател е от Бразилия"),
      story("b", "Локомотив Пловдив подписа с нападателя Жоао Силва", "2026-09-26T11:00:00Z", "Новият футболист е от Бразилия"),
    ], { now, excludeIds: ["neighbour"] });
    expect(result.map(({ id }) => id)).toEqual(["a"]);
  });
});
