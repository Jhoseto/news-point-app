import { afterEach, describe, expect, it, vi } from "vitest";
import { collectUnionIntercity, unionSearchBody, unionServiceDates, UNION_TIMETABLE_URL } from "./union-collection";
import { runPilotSource } from "./run";
import { pilotSources } from "./catalog";
import * as parser from "./union-intercity";

const source = pilotSources.find(source => source.id === "union-plovdiv-burgas")!;
const now = Date.parse("2026-10-30T12:00:00Z");
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Union public search boundary", () => {
  it.each([
    ["2026-10-30T22:30:00Z", ["2026-10-31", "2026-11-01"]],
    ["2026-03-28T22:30:00Z", ["2026-03-29", "2026-03-30"]],
    ["2026-10-24T21:30:00Z", ["2026-10-25", "2026-10-26"]],
    ["2026-12-31T22:30:00Z", ["2027-01-01", "2027-01-02"]],
  ])("uses Sofia calendar days at %s", (instant, dates) => {
    expect(unionServiceDates(Date.parse(instant))).toEqual(dates);
  });

  it("builds only fixed public timetable form fields", () => {
    expect(Object.fromEntries(unionSearchBody(source.id, "2026-10-31"))).toEqual({ type: "1", from: "128", to: "23", sdate: "31-10-2026", rdate: "", adults: "1" });
    expect(unionSearchBody("union-plovdiv-varna", "2026-10-31").get("to")).toBe("29");
    for (const date of ["2026-02-30", "2026-13-01", "31-10-2026", "2026-10-31&to=1"]) expect(() => unionSearchBody(source.id, date)).toThrow();
    expect(() => unionSearchBody("unapproved", "2026-10-31")).toThrow();
  });

  it.each(["https://union-ivkoni.com/bg/checkout", "https://example.com/bg/routes", "/bg/routes"])("never follows search redirects to %s", async location => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runPilotSource(source, { failures: 0, items: {} }, now);
    expect(result.journal.error).toBe("Union: timetable search redirect refused");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe(UNION_TIMETABLE_URL);
    expect(options).toMatchObject({ method: "POST", redirect: "manual", cache: "no-store" });
    expect(new URLSearchParams(options.body).get("sdate")).toBe("30-10-2026");
    expect(new Headers(options.headers).get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(new Headers(options.headers).has("cookie")).toBe(false);
  });

  it("rejects an altered source URL before making a request", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const result = await runPilotSource({ ...source, url: `${UNION_TIMETABLE_URL}?to=1` }, { failures: 0, items: {} }, now);
    expect(result.journal.outcome).toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("backs off a rate limit without trying the second date or renewing success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { "retry-after": "7200" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runPilotSource(source, { failures: 0, items: {}, lastSuccessAt: "2026-10-29T00:00:00Z" }, now);
    expect(result.journal.outcome).toBe("failed");
    expect(result.state.lastSuccessAt).toBe("2026-10-29T00:00:00Z");
    expect(Date.parse(result.state.nextDueAt!)).toBeGreaterThanOrEqual(now + 7_200_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cannot renew yesterday's snapshot with an invalid POST 304", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchMock);
    const lastSuccessAt = "2026-10-29T00:00:00Z";
    const result = await runPilotSource(source, { failures: 0, items: { old: "hash" }, bodyHash: "old", lastParsedAt: lastSuccessAt, lastSuccessAt }, now);
    expect(result.journal.error).toBe("Union: dated search requires a fresh response body");
    expect(result.state.lastSuccessAt).toBe(lastSuccessAt);
    expect(result.snapshot).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("collects exactly today and tomorrow without inventing additional dates", async () => {
    const parse = vi.spyOn(parser, "parseUnionIntercity").mockImplementation((_html, route, date) => ({ sourceId: route.sourceId, items: [{ key: date, fingerprint: date, fields: { date }, sourceUrl: UNION_TIMETABLE_URL }], completeness: "uncertain", limitations: [] }));
    const read = vi.fn().mockResolvedValue("tomorrow");
    const result = await collectUnionIntercity("today", source.id, now, read);
    expect(read.mock.calls).toEqual([["2026-10-31"]]);
    expect(parse.mock.calls.map(call => [call[0], call[2]])).toEqual([["today", "2026-10-30"], ["tomorrow", "2026-10-31"]]);
    expect(result.items.map(item => item.key)).toEqual(["2026-10-30", "2026-10-31"]);
    expect(result.completeness).toBe("uncertain");
  });

  it.each([200, 304, 403])("validates the second dated POST response, HTTP %s", async status => {
    vi.spyOn(parser, "parseUnionIntercity").mockImplementation((_html, route, date) => ({ sourceId: route.sourceId, items: [{ key: date, fingerprint: date, fields: { date }, sourceUrl: UNION_TIMETABLE_URL }], completeness: "uncertain", limitations: [] }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("today", { headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response(status === 304 ? null : "tomorrow", { status, headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runPilotSource(source, { failures: 0, items: {} }, now);
    expect(fetchMock.mock.calls.map(([url, options]) => [url, options.method, new URLSearchParams(options.body).get("sdate")])).toEqual([
      [UNION_TIMETABLE_URL, "POST", "30-10-2026"], [UNION_TIMETABLE_URL, "POST", "31-10-2026"],
    ]);
    if (status === 200) {
      expect(result.journal.outcome).toBe("parsed");
      expect(result.snapshot?.items).toHaveLength(2);
    } else {
      expect(result.journal.outcome).toBe("failed");
      expect(result.snapshot).toBeUndefined();
      expect(result.state.lastSuccessAt).toBeUndefined();
    }
  });

  it("does not publish partial success when the next day cannot be checked", async () => {
    vi.spyOn(parser, "parseUnionIntercity").mockReturnValue({ sourceId: source.id, items: [], completeness: "uncertain", limitations: [] });
    await expect(collectUnionIntercity("today", source.id, now, async () => { throw new Error("source unavailable"); })).rejects.toThrow("source unavailable");
  });
});
