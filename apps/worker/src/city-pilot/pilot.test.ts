import { afterEach, describe, expect, it, vi } from "vitest";
import { candidateSources } from "./catalog";
import { parsePilotPage } from "./parse";
import { runPilotSource } from "./run";

const vik = candidateSources.find((source) => source.id === "vik-outages")!;
const time = Date.parse("2026-10-24T10:00:00Z");

function vikPage(rows: string[]) {
  return `<div class="boxServiceContent"><p class="date">24.10.2026 г.</p><table class="accidents"><tbody>${rows.join("")}</tbody></table></div>`;
}

function vikRow(place: string, affected = "района на аварията") {
  return `<tr><td>гр. Пловдив</td><td>${place}</td><td>авария на водопровод</td><td>${affected}</td><td>от 09:00ч. до 17:00ч.</td></tr>`;
}

function response(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

afterEach(() => vi.unstubAllGlobals());

describe("city source pilot", () => {
  it("tracks an edit and a missing row without treating the missing row as resolved", async () => {
    const first = vikPage([vikRow("ул. А"), vikRow("ул. Б")]);
    const second = vikPage([vikRow("ул. А", "два квартала")]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(second)));

    const a = await runPilotSource(vik, { failures: 0, items: {} }, time);
    const b = await runPilotSource(vik, a.state, time + 30 * 60_000);

    expect(a.journal.outcome).toBe("parsed");
    expect((a.journal.changes as { added: string[] }).added).toHaveLength(2);
    expect((b.journal.changes as { changed: string[]; missing: string[] }).changed).toHaveLength(1);
    expect((b.journal.changes as { changed: string[]; missing: string[] }).missing).toHaveLength(1);
    expect(b.journal.completeness).toBe("uncertain");
  });

  it("preserves the last valid snapshot on a broken table and backs off", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(vikPage(["<tr><td>гр. Пловдив</td></tr>"]))));
    const previous = { failures: 0, items: { existing: "fingerprint" }, bodyHash: "old", lastParsedAt: "2026-10-24T09:00:00Z" };
    const result = await runPilotSource(vik, previous, time);
    expect(result.journal.outcome).toBe("failed");
    expect(result.state.items).toEqual(previous.items);
    expect(result.state.lastParsedAt).toBe(previous.lastParsedAt);
    expect(Date.parse(result.state.nextDueAt!)).toBeGreaterThan(time + 30 * 60_000);
  });

  it("uses a validated prior snapshot for 304 and honours Retry-After on 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 304 })).mockResolvedValueOnce(response("busy", 429, { "retry-after": "7200" })));
    const previous = { failures: 0, items: { x: "hash" }, bodyHash: "old", lastParsedAt: "2026-10-24T09:00:00Z" };
    const unchanged = await runPilotSource(vik, previous, time);
    const limited = await runPilotSource(vik, unchanged.state, time + 30 * 60_000);
    expect(unchanged.journal.outcome).toBe("unchanged");
    expect(limited.journal.outcome).toBe("failed");
    expect(Date.parse(limited.state.nextDueAt!)).toBeGreaterThanOrEqual(time + 30 * 60_000 + 7200_000);
  });

  it("rejects an unexpected redirect host", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } })));
    const result = await runPilotSource(vik, { failures: 0, items: {} }, time);
    expect(result.journal.outcome).toBe("failed");
    expect(result.journal.error).toBe("redirect left the source HTTPS host");
  });

  it("keeps distinct opera performances on the same date when times differ", () => {
    const card = (clock: string) => `<div class="row card event" data-id="2026-October"><div class="date"><span>30</span>/<span>10</span></div><div class="time"><span>${clock}</span></div><h5 class="title">Турандот</h5><div class="location">Опера Пловдив</div><a href="/bg/performance/details?id=549">Виж повече</a></div>`;
    const snapshot = parsePilotPage("plovdiv-opera", card("11:00") + card("19:00"));
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items.map((entry) => entry.fields.date)).toEqual(["2026-10-30", "2026-10-30"]);
  });

  it("does not retain personal names from a council agenda item", () => {
    const html = `<div id="content-bg"><h1>Дневен ред</h1><ol><li>26XI-455 /21-10-2026 – заявление от Иван Иванов</li></ol></div>`;
    const snapshot = parsePilotPage("plovdiv-council", html);
    expect(snapshot.items[0]?.fields).toEqual({ docket: "26XI-455" });
    expect(JSON.stringify(snapshot)).not.toContain("Иван Иванов");
  });
});
