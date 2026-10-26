import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

const headers = (direction: "Час на пристигане" | "Час на заминаване", route: "От" | "За") =>
  `<tr><th>${direction}</th><th>Компания</th><th>Полет</th><th>Тип</th><th>${route}</th><th>Статус</th><th>Забележка</th><th></th></tr>`;
const row = (date: string, flight: string, status = "Scheduled") =>
  `<tr><td>${date}</td><td></td><td>${flight}</td><td>B738</td><td>London - STN</td><td>${status}</td><td></td><td>към авиокомпанията</td></tr>`;
const board = `<table>${headers("Час на пристигане", "От")}${row("26.10.2026 12:20", "FR1836")}${row("27.10.2026 12:20", "FR1836")}</table>
<table>${headers("Час на заминаване", "За")}${row("26.10.2026 12:55", "FR1837")}${row("27.10.2026 12:55", "FR1837")}</table>`;

describe("Plovdiv airport published flight board", () => {
  it("keeps direction and date in identity and detects status edits", () => {
    const initial = parsePilotPage("plovdiv-airport-flights", board);
    const changed = parsePilotPage("plovdiv-airport-flights", board.replace("FR1837</td><td>B738</td><td>London - STN</td><td>Scheduled", "FR1837</td><td>B738</td><td>London - STN</td><td>Delayed"));
    expect(initial.items.map(item => item.key)).toEqual([
      "arrival:2026-10-26:FR1836", "arrival:2026-10-27:FR1836",
      "departure:2026-10-26:FR1837", "departure:2026-10-27:FR1837",
    ]);
    expect(changed.items[2]?.fields.status).toBe("Delayed");
    expect(changed.items[2]?.fingerprint).not.toBe(initial.items[2]?.fingerprint);
  });

  it("rejects broken direction tables, invalid dates and duplicate flights", () => {
    expect(() => parsePilotPage("plovdiv-airport-flights", board.replace("Час на заминаване", "Време"))).toThrow("columns changed");
    expect(() => parsePilotPage("plovdiv-airport-flights", board.replace("26.10.2026 12:20", "31.02.2026 12:20"))).toThrow("invalid flight date");
    expect(() => parsePilotPage("plovdiv-airport-flights", board.replace("27.10.2026 12:20", "26.10.2026 12:20"))).toThrow("duplicate key");
  });
});
