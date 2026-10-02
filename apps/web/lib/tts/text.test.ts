import { describe, expect, it } from "vitest";
import {
  expandAbbreviations,
  moneyToSentence,
  numbersToBulgarian,
  prepareForSpeech,
  preprocessBulgarian,
  stripHtml,
  timeToSentence,
} from "./text";

describe("stripHtml", () => {
  it("converts paragraph breaks into newlines", () => {
    expect(stripHtml("<p>Аз съм Пловдив.</p><p>Втори абзац.</p>")).toBe(
      "Аз съм Пловдив.\nВтори абзац.",
    );
  });
  it("converts headings into newlines", () => {
    expect(stripHtml("<h2>Заглавие</h2><p>Текст.</p>")).toBe(
      "Заглавие\nТекст.",
    );
  });
  it("converts <br> into a comma", () => {
    expect(stripHtml("първи ред<br>втори ред")).toBe("първи ред, втори ред");
    expect(stripHtml("първи ред<br/>втори ред")).toBe("първи ред, втори ред");
    expect(stripHtml("първи ред<br />втори ред")).toBe("първи ред, втори ред");
  });
  it("drops attributes but keeps text", () => {
    expect(stripHtml('<a href="https://example.com">линк</a>')).toBe("линк");
  });
  it("decodes the standard HTML entities", () => {
    expect(stripHtml("Том &amp; Джери")).toBe("Том и Джери");
    expect(stripHtml("&nbsp;интервал&nbsp;")).toBe(" интервал ");
    expect(stripHtml("&lt;tag&gt;")).toBe("tag");
    expect(stripHtml("&quot;цитат&quot;")).toBe('"цитат"');
    expect(stripHtml("&apos;апостроф&apos;")).toBe("'апостроф'");
  });
  it("decodes numeric HTML entities", () => {
    expect(stripHtml("&#1057;&#1080;&#1084;&#1086;&#1083;").length).toBe(5);
    expect(stripHtml("&#1057;&#1080;&#1084;&#1086;&#1083;")).toBe("Симол");
    expect(stripHtml("&#x421;&#x438;&#x43C;&#x43E;&#x43B;")).toBe("Симол");
  });
  it("treats lists as paragraph breaks", () => {
    expect(stripHtml("<ul><li>едно</li><li>две</li></ul>")).toBe("едно\nдве");
  });
  it("treats blockquotes as paragraph breaks", () => {
    expect(stripHtml("<blockquote>цитат</blockquote>")).toBe("цитат");
  });
  it("handles empty input", () => {
    expect(stripHtml("")).toBe("");
  });
  it("keeps nested tags' inner text", () => {
    expect(stripHtml("<p><strong>удебелено</strong> и <em>курсивно</em></p>")).toBe(
      "удебелено и курсивно",
    );
  });
});

describe("preprocessBulgarian", () => {
  it("drops http and https URLs", () => {
    expect(preprocessBulgarian("Виж https://example.com/news/")).toBe("Виж");
    expect(preprocessBulgarian("Виж http://example.org")).toBe("Виж");
  });
  it("drops www-prefixed URLs", () => {
    expect(preprocessBulgarian("Отиди на www.newspoint.bg")).toBe("Отиди на");
  });
  it("drops email addresses", () => {
    expect(preprocessBulgarian("Пиши на test@example.com за въпроси")).toBe(
      "Пиши на за въпроси",
    );
    expect(preprocessBulgarian("Мейл: redakcia@newspoint.bg.")).toBe(
      "Мейл: .",
    );
  });
  it("strips hashtag and mention markers but keeps the word", () => {
    expect(preprocessBulgarian("Следете #пловдив и @redakciq")).toBe(
      "Следете пловдив и redakciq",
    );
  });
  it("replaces triple-dot ellipsis with a comma", () => {
    expect(preprocessBulgarian("Мисля... може би")).toBe("Мисля, може би");
  });
  it("replaces the U+2026 ellipsis with a comma", () => {
    expect(preprocessBulgarian("Мисля… може би")).toBe("Мисля, може би");
  });
  it("collapses whitespace runs", () => {
    expect(preprocessBulgarian("дума   дума\tдума\nдума")).toBe("дума дума дума дума");
  });
  it("handles empty input", () => {
    expect(preprocessBulgarian("")).toBe("");
  });
  it("keeps Bulgarian Cyrillic punctuation", () => {
    expect(preprocessBulgarian("Здравей, свят! Как си?")).toBe("Здравей, свят! Как си?");
  });
});

describe("numbersToBulgarian", () => {
  it("reads calendar years as ordinals and small counts as feminine", () => {
    expect(numbersToBulgarian("2024 година")).toBe("две хиляди двадесет и четвърта година");
    expect(numbersToBulgarian("2026 година")).toBe("две хиляди двадесет и шеста година");
    expect(numbersToBulgarian("2024 г.")).toBe("две хиляди двадесет и четвърта година");
    expect(numbersToBulgarian("5 г.")).toBe("пет години");
    expect(numbersToBulgarian("1 неделя")).toContain("една");
    expect(numbersToBulgarian("2 неделя")).toContain("две");
    expect(numbersToBulgarian("1 година")).toBe("една година");
  });
  it("uses masculine form for non-year contexts", () => {
    expect(numbersToBulgarian("21")).toContain("двадесет и един");
    expect(numbersToBulgarian("2 пътуване")).toContain("два");
  });
  it("reads zero", () => {
    expect(numbersToBulgarian("0")).toBe("нула");
  });
  it("reads numbers below 100", () => {
    expect(numbersToBulgarian("21")).toContain("двадесет и един");
    expect(numbersToBulgarian("99")).toContain("деветдесет и девет");
    expect(numbersToBulgarian("100")).toContain("сто");
    expect(numbersToBulgarian("200")).toContain("двеста");
    expect(numbersToBulgarian("999")).toContain("деветстотин");
  });
  it("reads thousands", () => {
    expect(numbersToBulgarian("1000")).toContain("хиляда");
    expect(numbersToBulgarian("1001")).toContain("един");
    expect(numbersToBulgarian("1234")).toContain("хиляда двеста тридесет и четири");
  });
  it("preserves surrounding text", () => {
    expect(numbersToBulgarian("в 2024 бяха 21 новинарски екипажа")).toContain(
      "две хиляди двадесет и четири",
    );
    expect(numbersToBulgarian("в 2024 бяха 21 новинарски екипажа")).toContain(
      "двадесет и един",
    );
  });
  it("leaves non-numeric content untouched", () => {
    expect(numbersToBulgarian("Аз съм на 21")).toContain("двадесет и един");
    expect(numbersToBulgarian("няма числа тук")).toBe("няма числа тук");
  });
});

describe("expandAbbreviations", () => {
  it("expands EU as letter by letter", () => {
    expect(expandAbbreviations("Член е на ЕС")).toContain("Е С");
  });
  it("expands NATO as letter by letter", () => {
    expect(expandAbbreviations("Алиансът на НАТО")).toContain("Н А Т О");
  });
  it("expands САЩ as letter by letter", () => {
    expect(expandAbbreviations("в САЩ")).toContain("С А Щ");
  });
  it("expands СССР as letter by letter", () => {
    expect(expandAbbreviations("бившият СССР")).toContain("С С С Р");
  });
  it("expands НПО as letter by letter", () => {
    expect(expandAbbreviations("работи в НПО")).toContain("Н П О");
  });
  it("expands титли", () => {
    expect(expandAbbreviations("г-н Петров")).toContain("господин");
    expect(expandAbbreviations("г-жа Иванова")).toContain("госпожа");
    expect(expandAbbreviations("д-р Станев")).toContain("доктор");
    expect(expandAbbreviations("проф. Динев")).toContain("професор");
    expect(expandAbbreviations("доц. Тонев")).toContain("доцент");
  });
  it("expands place abbreviations", () => {
    expect(expandAbbreviations("гр. Пловдив")).toContain("град");
    expect(expandAbbreviations("с. Триград")).toContain("село");
    expect(expandAbbreviations("обл. Пловдив")).toContain("област");
    expect(expandAbbreviations("бул. България")).toContain("булевард");
    expect(expandAbbreviations("ул. Марица")).toContain("улица");
  });
  it("does not touch regular words", () => {
    expect(expandAbbreviations("Аз отивам в Пловдив")).toBe("Аз отивам в Пловдив");
  });
  it("handles empty input", () => {
    expect(expandAbbreviations("")).toBe("");
  });
  it("is case-sensitive in a conservative way", () => {
    expect(expandAbbreviations("ес")).toBe("ес");
    expect(expandAbbreviations("ЕС")).toContain("Е С");
  });
  it("handles punctuation boundaries", () => {
    expect(expandAbbreviations("Член,ЕС,гласува.")).toContain("Е С");
  });
});

describe("moneyToSentence", () => {
  it("reads 0.50 as нула лева и петдесет стотинки", () => {
    expect(moneyToSentence("0.50")).toBe("нула лева и петдесет стотинки");
  });
  it("reads 1.00 as един лев", () => {
    expect(moneyToSentence("1")).toBe("един лев");
    expect(moneyToSentence("1.00")).toBe("един лев");
  });
  it("reads 2.50 as два лева и петдесет стотинки", () => {
    expect(moneyToSentence("2.50")).toBe("два лева и петдесет стотинки");
  });
  it("reads 123.45 as сто двадесет и три лева и четиридесет и пет стотинки", () => {
    expect(moneyToSentence("123.45")).toContain("сто двадесет и три лева");
    expect(moneyToSentence("123.45")).toContain("четиридесет и пет стотинки");
  });
  it("handles comma as decimal separator", () => {
    expect(moneyToSentence("2,50")).toContain("два лева и петдесет стотинки");
  });
  it("returns the input verbatim when it is not money", () => {
    expect(moneyToSentence("не е число")).toBe("не е число");
  });
});

describe("timeToSentence", () => {
  it("reads 00:00", () => {
    expect(timeToSentence("00:00")).toBe("нула часа");
  });
  it("reads 09:00", () => {
    expect(timeToSentence("09:00")).toBe("девет часа");
  });
  it("reads 10:30", () => {
    expect(timeToSentence("10:30")).toBe("десет и тридесет");
  });
  it("reads 23:59", () => {
    expect(timeToSentence("23:59")).toBe("двадесет и три и петдесет и девет");
  });
  it("returns the input verbatim when it is not a 24-hour clock", () => {
    expect(timeToSentence("не е час")).toBe("не е час");
    expect(timeToSentence("25:00")).toBe("25:00");
  });
});

describe("prepareForSpeech", () => {
  it("runs the full pipeline on a simple sentence", () => {
    expect(prepareForSpeech("В 2024 година ЕС прие нов бюджет.")).toContain(
      "две хиляди двадесет и четвърта",
    );
    expect(prepareForSpeech("В 2024 година ЕС прие нов бюджет.")).toContain("Е С");
  });
  it("reads a news sentence the way a presenter would", () => {
    expect(prepareForSpeech("На 8 март 2024 г. в 10:30 ч. цената е 2,50 лв., ръст от 15%.")).toBe(
      "На осми март две хиляди двадесет и четвърта година в десет и тридесет цената е два лева и петдесет стотинки, ръст от петнадесет процента.",
    );
  });
  it("reads 101 with the conjunction and keeps 121", () => {
    expect(prepareForSpeech("101")).toBe("сто и един");
    expect(prepareForSpeech("121")).toBe("сто двадесет и един");
    expect(prepareForSpeech("1001")).toBe("хиляда и един");
  });
  it("spells a phone number digit by digit", () => {
    expect(prepareForSpeech("Обадете се на 0888 123 456.")).toContain("нула осем осем осем");
    expect(prepareForSpeech("Обадете се на 0888 123 456.")).not.toContain("0888");
  });
  it("strips URLs and emails", () => {
    expect(prepareForSpeech("Кандидатствай на https://jobs.bg или jobs@example.com")).not.toContain(
      "https",
    );
    expect(prepareForSpeech("Кандидатствай на https://jobs.bg или jobs@example.com")).not.toContain(
      "@",
    );
  });
  it("handles abbreviation followed by punctuation", () => {
    expect(prepareForSpeech("НАТО.")).toContain("Н А Т О");
  });
  it("keeps Bulgarian Cyrillic text intact", () => {
    expect(prepareForSpeech("Това е тест за български правопис.")).toBe(
      "Това е тест за български правопис.",
    );
  });
  it("handles empty input", () => {
    expect(prepareForSpeech("")).toBe("");
  });
});