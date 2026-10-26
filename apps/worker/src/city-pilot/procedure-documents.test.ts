import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { archiveProcedurePdf, auctionConditions, competitionSections, transcribePdfFragments } from "./procedure-documents";
import { consultationAttachments, consultationDescription } from "./public-consultations";

const fixture = (name: string) => readFile(new URL(`../../../../tests/fixtures/city-procedures/${name}.txt`, import.meta.url), "utf8");
it("does not insert spaces into words split across PDF font fragments", () => {
  expect(transcribePdfFragments([{ str: "не са ", hasEOL: false }, { str: "осъждан", hasEOL: false }, { str: "и", hasEOL: true }, { str: "за престъпление", hasEOL: false }])).toBe("не са осъждани\nза престъпление");
});

it("retains all numbered requirements and document lists from the two real notices", async () => {
  const ecobusText = await fixture("competition-ecobus");
  const ecobus = competitionSections(ecobusText);
  const medical = competitionSections(await fixture("competition-mental-health"));
  expect(ecobus.requirements).toContain("10.");
  expect(ecobus.requiredDocuments).toContain("6.");
  expect(medical.requirements).toContain("15.");
  expect(medical.requiredDocuments).toContain("7.");
  expect(medical.requirements).toContain("психиатрия");
  expect(ecobus.submission).toContain("плик №2");
  expect(() => competitionSections(ecobusText.replace("Необходими документи", "Променен раздел"))).toThrow("incomplete");
});

it("extracts amounts only from the verified table layout and keeps all submission conditions", async () => {
  const notice = await fixture("auction-20261014-building");
  expect(auctionConditions(notice)).toMatchObject({ startingRent: "200", participationDeposit: "500", documentFee: "250" });
  expect(auctionConditions(notice).auctionConditions).toContain("10 години");
  expect(auctionConditions(notice.replace("без вкл. ДДС", "с вкл. ДДС"))).toEqual({});
  expect(auctionConditions(notice.replace("500 €", "650 €")).participationDeposit).toBe("650");
});

it("rejects HTML masquerading as a PDF before archiving", async () => {
  await expect(archiveProcedurePdf(new TextEncoder().encode("<html>blocked</html>"), "QA", ".")).rejects.toThrow("invalid PDF");
});

const attachment = (id: string, title = "Проект на акт - вер. 1.0") => `<a data-file="${id}" data-url="https://strategy.bg/file-preview-modal/${id}">${title}</a>`;
it("supports combined documents and rejects foreign, duplicate or missing project attachments", () => {
  const html = `<div><h3>Документи</h3>${attachment("123")}</div>`;
  expect(consultationAttachments(html)).toEqual([{ title: "Проект на акт - вер. 1.0", url: "https://strategy.bg/download/123" }]);
  expect(() => consultationAttachments(html.replace("https://strategy.bg/", "https://example.com/"))).toThrow("location changed");
  expect(() => consultationAttachments(html.replace("</div>", `${attachment("123")}</div>`))).toThrow("duplicated");
  expect(() => consultationAttachments(html.replace("Проект на акт", "Справка"))).toThrow("incomplete");
});

it("reads the proposal introduction without collecting public comments", () => {
  const introduction = "Описание на предложените промени и причините за тях, публикувано към конкретния проект.";
  const html = `<div><p>${introduction}</p></div><div><h3>Отговорна институция</h3>Община</div><div><h3>Коментари</h3>Чуждо мнение</div>`;
  expect(consultationDescription(html)).toBe(introduction);
});
