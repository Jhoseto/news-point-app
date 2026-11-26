import { describe, expect, it } from "vitest";
import { questionNewsTerms, questionNewsContext } from "../../../polit-compass/data/news-terms";
import { voteQuestions } from "../../../polit-compass/data/bg-votes.mjs";
import { questionNewsCandidates, selectQuestionNews } from "./question-news";
import type { ArticleSummary } from "./queries";

const now = Date.UTC(2026, 10, 26);
function story(id: string, title: string, excerpt = "", days = 0): ArticleSummary {
  return { id, title, excerpt, publishedAt: new Date(now - days * 86400000), path: "/" + id, authorName: "", hero: null, category: null };
}

describe("political compass news", () => {
  it("has a distinct issue-specific context search for every active question", () => {
    for (const q of voteQuestions) {
      expect(questionNewsTerms.get(q.id)?.length).toBeGreaterThan(0);
      expect(questionNewsContext.get(q.id)?.length).toBeGreaterThan(1);
    }
  });
  it("keeps archive coverage of water tariffs phrased differently from the bill", () => {
    const candidates = [
      story("1","Водата в Пловдив поскъпва с 6,5% от 1 март 2026 г."),
      story("2","Пловдив посреща Новата година с по-висока цена на водата"),
      story("3","Пенсионерски организации искат лимит за комуналните сметки","Предлагат таван на цените на електроенергията и водата."),
      story("4","Водата заля няколко улици след пороя"),
    ];
    expect(questionNewsCandidates(candidates, questionNewsTerms.get("ns52-20260529-3")!).map(a => a.id)).toEqual(["1","2","3"]);
  });
  it("fills with current thematic coverage before older exact items and keeps display chronological", () => {
    const a = story("a","КЕВР обсъжда нови тарифи", "", 15);
    const b = story("b","Поскъпват услугите за домакинствата","", 2);
    const c = story("c","Промени в цената на водата","", 360);
    expect(selectQuestionNews([a,c],[b,a],now,2).map(x => x.id)).toEqual(["b","a"]);
    expect(selectQuestionNews([a,c],[b,a],now).map(x => x.id)).toEqual(["b","a","c"]);
  });
  it("selects three distinct November NewsPoint headlines for the medical expertise question", () => {
    const candidates = [
      story("fraud","Окръжният прокурор на Разград разкри как е действала схемата с фалшивите ТЕЛК-ове","",2),
      story("review","Готвят сериозни промени в ТЕЛК: Изкуствен интелект ще проверява съмнителни решения","",8),
      story("rights","Омбудсманът с предупреждение: Автоматичните проверки на ТЕЛК могат да застрашат правата на хората с увреждания","",16),
    ];
    const direct = questionNewsCandidates(candidates, questionNewsTerms.get("bg-medical-expertise")!);
    const context = questionNewsCandidates(candidates, questionNewsContext.get("bg-medical-expertise")!);
    expect(selectQuestionNews(direct, context, now).map(s => s.id)).toEqual(["fraud","review","rights"]);
  });
  it("rejects false substrings and recognises inflected words", () => {
    const terms = questionNewsContext.get("bg-pension-minimum-2026")!;
    expect(questionNewsCandidates([story("a","Компенсиите за бизнеса"),story("b","Пенсиите през декември")], terms).map(x=>x.id)).toEqual(["b"]);
  });
  it("does not mistake resumed oil supplies, a traffic light repair or wrestling in Uzbekistan for the policy", () => {
    for (const [id, title] of [
      ["bg-renewable-power-contracts","Русия възобновява доставките на дизел"],
      ["bg-right-to-repair","Ремонт на светофарната уредба затваря булеварда"],
      ["bg-eu-uzbekistan","Български борец се класира на финал в Узбекистан"],
    ] as const) {
      expect(questionNewsCandidates([story("qa",title)], [
        ...questionNewsTerms.get(id)!, ...questionNewsContext.get(id)!,
      ])).toEqual([]);
    }
  });
});
