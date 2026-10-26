import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { collectLowEmissionPermit, lowEmissionPermitLinks, lowEmissionPermitSections } from "./low-emission-permit";
const fixture = (name: string) => readFileSync(new URL(`../../../../tests/fixtures/city-procedures/low-emission-${name}.txt`, import.meta.url), "utf8");
const info = fixture("conditions"), form = fixture("form");
const html = '<div id="content"><h1>Бланки и формуляри</h1><p><strong>Зона с ниски емисии:</strong></p><p><a href="/wp-content/uploads/2026/09/info.pdf">Информация</a></p><p><a href="/wp-content/uploads/2026/09/form.pdf">Заявление</a></p><p><strong>Синя зона:</strong></p><p><a href="/another.doc">Заявление</a></p></div>';
it("scopes the matched information and form to the low-emission section", () => {
  expect(lowEmissionPermitLinks(html)).toHaveLength(2);
  expect(() => lowEmissionPermitLinks(html.replace('href="/wp-content/uploads/2026/09/form.pdf"', 'href="https://other.test/form.pdf"'))).toThrow("unexpected");
  expect(() => lowEmissionPermitLinks(html.replace("Заявление</a>", "Променено</a>"))).toThrow();
});
it("preserves eligibility, all six conditional documents and the actual validity", () => {
  const result = lowEmissionPermitSections(info, form);
  expect(result.eligibility).toContain("исторически МПС");
  expect(result.requiredDocuments).toContain("в случай, че не е собствено");
  expect(result.validity).toContain("до 1 /една/ година");
  expect(result.changes).toContain("7-дневен срок");
  expect(result.submission).toContain("деловодството");
  expect(() => lowEmissionPermitSections(info.replace("представени следните документи:", "променено"), form)).toThrow();
  expect(() => lowEmissionPermitSections(info, form.replace("Приложение 1 към чл. 6, ал. 2", "Друг формуляр"))).toThrow();
});
it("versions corrections and refuses a missing application instead of exposing a partial package", async () => {
  const reader = async (url: string, title: string) => ({ title, hash: "a".repeat(64), pages: 1, text: url.endsWith("info.pdf") ? info : form });
  const before = await collectLowEmissionPermit(html, reader);
  const after = await collectLowEmissionPermit(html, async (url, title) => ({ ...await reader(url, title), text: (await reader(url, title)).text.replace("до 1 /една/ година", "до 2 /две/ години") }));
  expect(after.items[0]?.fingerprint).not.toBe(before.items[0]?.fingerprint);
  await expect(collectLowEmissionPermit(html, async (url, title) => { if (url.endsWith("form.pdf")) throw new Error("HTTP 404"); return reader(url, title); })).rejects.toThrow("HTTP 404");
});
