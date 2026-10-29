import { describe, expect, it } from "vitest";
import { parseGalleryExhibitionDetail, parsePilotPage } from "./parse";

const card = (slug: string, title: string, end: string) => `<div class="card"><div class="card__body"><a class="card__link" href="https://galleryplovdiv.com/bg/izlojbi/${slug}"><h3 class="card__title">${title}</h3></a><div class="card__helper-text"><time datetime="2026-10-07 00:00:00">07.10.2026</time> - <time datetime="${end} 00:00:00">${end}</time></div><div class="card__helper-text">Галерия „КАПАНА“</div></div></div>`;

describe("gallery exhibition listing", () => {
  it("extracts dated exhibitions with stable page slugs and detects edits", () => {
    const before = parsePilotPage("plovdiv-gallery-current", card("first", "Първа изложба", "2026-10-27"));
    const after = parsePilotPage("plovdiv-gallery-current", card("first", "Първа изложба", "2026-10-28"));
    expect(before.items[0]).toMatchObject({ key: "first", sourceUrl: "https://galleryplovdiv.com/bg/izlojbi/first", fields: { title: "Първа изложба", endDate: "2026-10-27", venue: "Галерия „КАПАНА“" } });
    expect(before.items[0]?.fingerprint).not.toBe(after.items[0]?.fingerprint);
    const detail = `<main><h1>Първа изложба</h1><div class="st-473"><div class="text"><p>Подробен официален текст за изложбата, художника и представените творби.</p><p>Втори абзац с още контекст за посетителите.</p><p>текст: Автор</p></div></div></main>`;
    expect(parseGalleryExhibitionDetail(detail, before.items[0]!)).toEqual({ description: "Подробен официален текст за изложбата, художника и представените творби.\n\nВтори абзац с още контекст за посетителите." });
  });

  it("rejects a broken or empty listing", () => {
    expect(() => parsePilotPage("plovdiv-gallery-current", card("first", "Първа изложба", "2026-02-31"))).toThrow("incomplete exhibition card");
    expect(() => parsePilotPage("plovdiv-gallery-current", "<main></main>")).toThrow("listing missing or changed");
  });
});
