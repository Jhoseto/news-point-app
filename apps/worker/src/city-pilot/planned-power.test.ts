import { expect, it, vi } from "vitest";
import { parsePlannedPower } from "./planned-power";
import { runPilotSource } from "./run";
const now = new Date("2026-10-26T10:00:00Z");
const block = (address = "ГР. ПЛОВДИВ — ул. Тестова", dates = "26.10.2026 до 27.10.2026", hours = "09:00 - 16:30") => `<table>${[["Област", "ПЛОВДИВ"], ["КЕЦ", "Пловдив Северозапад"], ["Адрес(и)", address], ["Срок на изключването от / до", hours], ["Дата(и) на изключването", dates]].map(cells => `<tr>${cells.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</table>`;
it("uses addresses rather than the regional/centre title and preserves edits under one stable key", () => {
  expect(parsePlannedPower(block("ГР. АСЕНОВГРАД — ул. Тестова"), now).items).toEqual([]);
  const first = parsePlannedPower(block(), now).items[0]!;
  const changed = parsePlannedPower(block(undefined, undefined, "10:00 - 17:00"), now).items[0]!;
  expect(first.key).toBe(changed.key); expect(first.fingerprint).not.toBe(changed.fingerprint);
  expect(first.fields).toMatchObject({ startDate: "2026-10-26", endDate: "2026-10-27", startTime: "09:00" });
});
it("rejects blank/broken tables, unknown windows and impossible dates; excludes expired rows", () => {
  for (const html of ["", "<table></table>", block().replace("КЕЦ", "changed"), block(undefined, "31.02.2026 до 27.10.2026"), block(undefined, undefined, "29:00 - 30:00")]) expect(() => parsePlannedPower(html, now)).toThrow();
  expect(parsePlannedPower(block(undefined, "23.10.2026 до 24.10.2026"), now).items).toEqual([]);
});
it("honours the publisher's Windows-1251 meta declaration when the HTTP header omits a charset", async () => {
  const html = '<meta http-equiv="Content-Type" content="text/html; charset=windows-1251">' + block("ГР. ПЛОВДИВ, ул. Тестова");
  const bytes = new Uint8Array([...html].map(char => { const code = char.codePointAt(0)!; return code >= 0x410 && code <= 0x44f ? code - 0x350 : code; }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, { headers: { "content-type": "text/html" } })));
  try {
    const result = await runPilotSource({ id: "elyug-planned-plovdiv-region", category: "outages", format: "html", url: "https://www.elyug.bg/oldservices/ec_ep/abschaltung_bg/abschaltung4.asp" }, { failures: 0, items: {} }, now.getTime());
    expect(result.journal.outcome).toBe("parsed");
    expect(result.snapshot?.items[0]?.fields.address).toBe("ГР. ПЛОВДИВ, ул. Тестова");
  } finally { vi.unstubAllGlobals(); }
});
