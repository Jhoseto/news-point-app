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
it("keeps the city outage when another regional row uses an unpadded day", () => {
  const html = block("ГР. ХИСАР — тестов адрес", "3.11.2026 до 3.11.2026")
    + block("ГР. ПЛОВДИВ — тестов адрес", "30.10.2026 до 30.10.2026", "10:00 - 13:00");
  const result = parsePlannedPower(html, new Date("2026-10-30T09:00:00Z"));
  expect(result.items).toHaveLength(1);
  expect(result.items[0]?.fields).toMatchObject({ address: "ГР. ПЛОВДИВ — тестов адрес", startDate: "2026-10-30", endDate: "2026-10-30", startTime: "10:00", endTime: "13:00" });
});
it("normalizes unpadded days and months without changing identity or accepting impossible dates", () => {
  const unpadded = parsePlannedPower(block(undefined, "3.1.2027 до 3.1.2027"), now).items[0]!;
  const padded = parsePlannedPower(block(undefined, "03.01.2027 до 03.01.2027"), now).items[0]!;
  expect(unpadded).toEqual(padded);
  expect(unpadded.fields.startDate).toBe("2027-01-03");
  for (const date of ["0.1.2027", "32.1.2027", "1.0.2027", "1.13.2027", "31.4.2027", "29.2.2027"])
    expect(() => parsePlannedPower(block(undefined, `${date} до ${date}`), now)).toThrow();
  expect(parsePlannedPower(block(undefined, "29.2.2028 до 29.2.2028"), now).items[0]?.fields.startDate).toBe("2028-02-29");
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
