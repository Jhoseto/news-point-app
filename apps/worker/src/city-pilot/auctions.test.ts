import { describe, expect, it } from "vitest";
import { collectMunicipalAuctions, parseAuctionListing, parseAuctionNoticeText, parseAuctionTerminations } from "./auctions";

const url = "/wp-content/uploads/2026/10/Targ_56784505245.pdf";
const block = (published = "14.10.2026", href = url) => `<div class="anons"><p><strong>Дата на публикуване:</strong> ${published} г.</p><p><a href="${href}">Обява за търг за терен 56784.505.245 в Пловдив</a></p></div>`;
const page = (...blocks: string[]) => `<div id="content"><h1>Търгове</h1>${blocks.join("")}</div>`;
const notice = (deadline = "28.10.2026", auction = "30.10.2026") => `ОБЩИНА ПЛОВДИВ ОБЯВА: Търг с тайно наддаване за терен 56784.505.245. Документите за участие в търга се подават от 14.10.2026г. до ${deadline}г. включително. Търгът ще се проведе на ${auction} г. от 11:00 часа.`;
const terminationPage = (title = "Заповед за друг имот") => `<div id="content"><h1>Обяви</h1><div class="anons"><p><strong>Дата на публикуване:</strong> 20.10.2026 г.</p><p><a href="/wp-content/uploads/2026/10/termination.pdf">${title}</a></p></div></div>`;
const now = new Date("2026-10-26T06:00:00Z");

describe("municipal auction PDF pilot", () => {
  it("reads only recent document links on the official host", () => {
    expect(parseAuctionListing(page(block(), block("20.08.2026", "/wp-content/uploads/2026/08/old.pdf")), now)).toHaveLength(1);
    expect(() => parseAuctionListing(page(block("14.10.2026", "https://other.example/notice.pdf")), now)).toThrow("unsupported notice document");
    expect(() => parseAuctionListing(page(block(), block()), now)).toThrow("duplicate notice document");
  });

  it("extracts the application deadline and auction date, rejecting malformed order", () => {
    expect(parseAuctionNoticeText(notice(), "2026-10-14")).toEqual({ deadline: "2026-10-28", auctionDate: "2026-10-30" });
    expect(() => parseAuctionNoticeText(notice("31.10.2026", "30.10.2026"), "2026-10-14")).toThrow("inconsistent");
    expect(() => parseAuctionNoticeText(notice("31.11.2026"), "2026-10-14")).toThrow("invalid date");
    expect(() => parseAuctionNoticeText("ОБЩИНА ПЛОВДИВ Търг на 30.10.2026", "2026-10-14")).toThrow("deadline or auction date missing");
  });

  it("retains only open applications and versions document edits", async () => {
    const first = await collectMunicipalAuctions(page(block()), terminationPage(), async () => notice(), now);
    const changed = await collectMunicipalAuctions(page(block()), terminationPage(), async () => notice("29.10.2026"), now);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.fields.deadline).toBe("2026-10-28");
    expect(changed.items[0]?.key).toBe(first.items[0]?.key);
    expect(changed.items[0]?.fingerprint).not.toBe(first.items[0]?.fingerprint);
    const expired = await collectMunicipalAuctions(page(block()), terminationPage(), async () => notice(), new Date("2026-10-29T06:00:00Z"));
    expect(expired.items).toEqual([]);
  });

  it("fails a recent notice when its document cannot be validated", async () => {
    await expect(collectMunicipalAuctions(page(block()), terminationPage(), async () => "No valid PDF text", now)).rejects.toThrow("not a Plovdiv auction");
    await expect(collectMunicipalAuctions(page(block(), block("08.10.2026", "/wp-content/uploads/2026/10/other.pdf")), terminationPage(), async url => url.endsWith("other.pdf") ? "broken" : notice(), now)).rejects.toThrow();
  });

  it("removes a tender only after the separate dated termination PDF confirms the same parcel", async () => {
    const title = "Заповед за прекратяване на процедура по провеждане на публичен търг за ПИ с идентификатор 56784.505.245";
    const listing = terminationPage(title);
    expect(parseAuctionTerminations(listing, now)).toHaveLength(1);
    const cancelled = await collectMunicipalAuctions(page(block()), listing, async url => url.endsWith("termination.pdf")
      ? "ОБЩИНА ПЛОВДИВ. Прекратявам процедура по провеждане на публичен търг за ПИ с идентификатор 56784.505.245"
      : notice(), now);
    expect(cancelled.items).toEqual([]);
    await expect(collectMunicipalAuctions(page(block()), listing, async url => url.endsWith("termination.pdf")
      ? "Заповед за друг имот"
      : notice(), now)).rejects.toThrow("does not confirm");
    expect(() => parseAuctionTerminations(terminationPage(title.replace("56784.505.245", "непосочен имот")), now)).toThrow("ambiguous termination");
    expect(() => parseAuctionTerminations(terminationPage("Заповед за отмяна на търг за непосочен имот"), now)).toThrow("ambiguous termination");
  });
});
