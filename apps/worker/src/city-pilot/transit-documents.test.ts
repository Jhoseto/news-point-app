import { describe, expect, it, vi } from "vitest";
import { collectTransitDocuments, parseTransitDocument, transitDocumentLinks } from "./transit-documents";

const now = new Date("2026-10-30T09:00:00Z");
// Explicit synthetic fixtures follow the labels and validity wording inspected in official PDFs 1, 10 and 44.
const lines = [1, 6, 9, 11, 12, 15, 17, 20, 21, 25, 26, 27, 29, 44, 66, 116, 222, 10, 18, 24, 93, 99, 4, 7, 16, 22, 37, 113, 36];
const path = (line: number) => `/wp-content/uploads/2026/09/AvtobusnaLiniya${line}.pdf`;
const anchor = (line: number) => `<a href="${path(line)}">Маршрутно разписание на автобусна линия ${line}</a>`;
const html = (body = lines.map(anchor).join("")) => `<div id="content"><h1>Масов градски транспорт-маршрути, разписание, карти, спирки</h1><p>Актуални маршрутни разписания на автобусни линии от МГТ на гр. Пловдив</p>${body}</div>`;
const document = (line = 1) => ({
  title: `QA разписание ${line}`, pages: 5, hash: "a".repeat(64),
  text: `ОБЩИНА ПЛОВДИВ ОБЩИНСКО ПРЕДПРИЯТИЕ „ОРГАНИЗАЦИЯ И КОНТРОЛ НА ТРАНСПОРТА“
Маршрутно разписание на автобусна линия №${line}
съгласно Заповед № 26 ОА – 2451/14.09.2026 г. Делник
кв. Коматево пр. тр. 5:30 6:10 АПК Тракия пр. тр. 6:03 6:10
Заповед № 26 ОА – 2451/14.09.2026 г. на Кмета на Община Пловдив, в сила от 15.09.2026 г.
до 30.06.2027 г. или до второ нареждане, относно Договор № 26 ДГ-677/24.06.2026 г. със срок от 01.07.2026 г. до 01.07.2036 г.
Маршрутно разписание на автобусна линия № ${line} Празник
в сила от 15.09.2026 г. до 30.06.2027г. или до второ нареждане.`,
});
const link = transitDocumentLinks(html()).find(item => item.line === "1")!;

describe("official urban timetable documents", () => {
  it("discovers the published line links without guessing filenames and deduplicates identical links", () => {
    const result = transitDocumentLinks(html().replace(path(44), "/wp-content/uploads/2026/10/Avtobusna-liniya-44.pdf"));
    expect(result).toHaveLength(29);
    expect(result[0]?.title).toBe("Маршрутно разписание за линия 1");
    expect(result.find(item => item.line === "44")?.url).toBe("https://www.plovdiv.bg/wp-content/uploads/2026/10/Avtobusna-liniya-44.pdf");
    expect(transitDocumentLinks(html(lines.map(anchor).join("") + anchor(1)))).toHaveLength(29);
  });

  it("rejects incomplete, oversized and ambiguous lists before any fetch", async () => {
    const read = vi.fn();
    for (const body of [lines.slice(0, 28).map(anchor).join(""), [...lines, 300, 301, 302, 303, 304, 305, 306].map(anchor).join(""), lines.map(anchor).join("") + anchor(1).replace(path(1), path(333)), lines.map(anchor).join("").replace(path(6), path(1))]) {
      await expect(collectTransitDocuments(html(body), read, now)).rejects.toThrow();
    }
    expect(read).not.toHaveBeenCalled();
    expect(() => transitDocumentLinks(html().replace("Актуални маршрутни", "Архивни маршрутни"))).toThrow();
  });

  it.each([
    "https://example.org/wp-content/uploads/2026/09/AvtobusnaLiniya1.pdf",
    "https://www.plovdiv.bg.evil.test/wp-content/uploads/2026/09/AvtobusnaLiniya1.pdf",
    "https://user:password@www.plovdiv.bg/wp-content/uploads/2026/09/AvtobusnaLiniya1.pdf",
    "http://www.plovdiv.bg/wp-content/uploads/2026/09/AvtobusnaLiniya1.pdf",
    "/private/AvtobusnaLiniya1.pdf", `${path(1)}?download=1`, `${path(1)}#page=2`,
    "/wp-content/uploads/2026/09/%2e%2e/AvtobusnaLiniya1.pdf", "file:///tmp/timetable.pdf",
  ])("rejects an unapproved attachment: %s", badUrl => {
    expect(() => transitDocumentLinks(html().replace(path(1), badUrl))).toThrow();
  });

  it("retains the original PDF and the timetable interval, without inventing stop times or calendar days", () => {
    const item = parseTransitDocument(document(), link, now);
    expect(item).toMatchObject({ key: "1", sourceUrl: link.url, fields: { line: "1", validFrom: "2026-09-15", validThrough: "2027-06-30", dayTypes: "Делник / Празник" } });
    expect(JSON.parse(String(item.fields.documents))).toEqual([document()]);
    expect(Object.keys(item.fields).sort()).toEqual(["dayTypes", "documents", "line", "title", "validFrom", "validThrough"]);
    expect(parseTransitDocument(document(), link, new Date("2026-10-31T12:00:00Z")).fields.dayTypes).toBe("Делник / Празник");
  });

  it("rejects wrong line, missing day type, absent validity and conflicting repeated periods", () => {
    for (const text of [document(10).text, document().text.replace("Празник", ""), document().text.replace("Делник", ""), document().text.replaceAll("в сила от", "със срок от"), document().text.replace("до 30.06.2027г.", "до 30.05.2027г.")]) {
      expect(() => parseTransitDocument({ ...document(), text }, link, now)).toThrow();
    }
  });

  it("accepts line 93's exact shorter official heading while rejecting mismatched and mixed line numbers", () => {
    const link93 = transitDocumentLinks(html()).find(item => item.line === "93")!;
    const actualHeading = { ...document(93), pages: 6, text: document(93).text.replaceAll("Маршрутно разписание на", "Маршрут на") };
    expect(parseTransitDocument(actualHeading, link93, now)).toMatchObject({ key: "93", fields: { line: "93", validFrom: "2026-09-15", validThrough: "2027-06-30" } });
    for (const text of [actualHeading.text.replaceAll("№93", "№99").replaceAll("№ 93", "№ 99"), actualHeading.text.replace("№ 93", "№ 99"), actualHeading.text.replaceAll("№93", "№930").replaceAll("№ 93", "№ 930")]) {
      expect(() => parseTransitDocument({ ...actualHeading, text }, link93, now)).toThrow("document identity mismatch");
    }
  });

  it.each(["31.09.2026", "29.02.2026", "00.09.2026", "15.13.2026"])("validates actual calendar dates: %s", date => {
    expect(() => parseTransitDocument({ ...document(), text: document().text.replaceAll("15.09.2026", date) }, link, now)).toThrow("invalid validity date");
  });

  it("rejects reversed, future and expired intervals and uses the inclusive Sofia end date", () => {
    expect(() => parseTransitDocument({ ...document(), text: document().text.replaceAll("30.06.2027", "01.09.2026") }, link, now)).toThrow("conflicting validity periods");
    expect(() => parseTransitDocument(document(), link, new Date("2026-09-14T20:59:59Z"))).toThrow("outside its stated validity");
    expect(() => parseTransitDocument(document(), link, new Date("2027-06-30T20:59:59Z"))).not.toThrow();
    expect(() => parseTransitDocument(document(), link, new Date("2027-06-30T21:00:00Z"))).toThrow("outside its stated validity");
  });

  it("collects every verified PDF, changes fingerprint on a correction and stops on a failed document", async () => {
    const read = vi.fn(async (url: string) => document(Number(url.match(/Liniya(\d+)\.pdf$/u)?.[1])));
    const snapshot = await collectTransitDocuments(html(), read, now);
    expect(snapshot.sourceId).toBe("plovdiv-transit-documents");
    expect(snapshot.items).toHaveLength(29);
    expect(read).toHaveBeenCalledTimes(29);
    const corrected = parseTransitDocument({ ...document(), hash: "b".repeat(64) }, link, now);
    expect(corrected.key).toBe("1");
    expect(corrected.fingerprint).not.toBe(parseTransitDocument(document(), link, now).fingerprint);
    const failure = vi.fn(async () => { throw new Error("HTTP 503"); });
    await expect(collectTransitDocuments(html(), failure, now)).rejects.toThrow("HTTP 503");
    expect(failure).toHaveBeenCalledTimes(1);
  });
});
