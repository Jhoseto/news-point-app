import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parsePlovdivGtfsArchive } from "./gtfs";

// Explicit QA fixtures, not a copy of the live Plovdiv schedule.
const friday = Date.parse("2026-10-30T09:00:00Z");
const saturday = Date.parse("2026-10-31T09:00:00Z");
const calendarHeader = "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n";
const weekday = "WK,1,1,1,1,1,0,0,20261001,20261231\n";
const holiday = "HOL,0,0,0,0,0,0,0,20261001,20261231\n";
const exceptionHeader = "service_id,date,exception_type\n";
const fixture: Record<string, string> = {
  "feed_info.txt": "feed_start_date,feed_end_date,feed_version\n20261001,20261231,20261030\n",
  "calendar.txt": calendarHeader + weekday + holiday,
  "agency.txt": "agency_timezone\nEurope/Sofia\n",
  "routes.txt": "route_id,route_type,route_short_name,route_long_name\nr1,3,1,QA делнична линия\nr2,3,2,QA празнична линия\n",
  "trips.txt": "route_id,service_id,trip_headsign,trip_id\nr1,WK,QA делнична крайна,t1\nr2,HOL,QA празнична крайна,t2\n",
  "stops.txt": "stop_id,stop_name\ns1,QA начало\ns2,QA край\n",
  "stop_times.txt": "trip_id,stop_id,arrival_time,departure_time,stop_sequence\nt1,s1,08:00:00,08:00:00,1\nt1,s2,08:10:00,08:10:00,2\nt2,s1,10:00:00,10:00:00,1\nt2,s2,10:10:00,10:10:00,2\n",
};
function archive(changes: Record<string, string | null> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries({ ...fixture, ...changes })) {
    if (content !== null) files[name] = strToU8(content);
  }
  return zipSync(files);
}
function exceptions(rows: string): Record<string, string> {
  return { "calendar_dates.txt": exceptionHeader + rows };
}
function parse(changes: Record<string, string | null> = {}, now = friday) {
  return parsePlovdivGtfsArchive(archive(changes), now);
}

describe("Plovdiv GTFS concrete Sofia service date", () => {
  it("keeps the current weekday timetable and skips a valid inactive route", () => {
    const result = parse();
    expect(result.items.map(item => item.key)).toEqual(["r1"]);
    expect(result.items[0]?.fields).toMatchObject({ line: "1", destinations: "QA делнична крайна", serviceDate: "2026-10-30" });
    expect(JSON.parse(String(result.items[0]?.fields.timetable))[0].stops[0].times).toEqual(["08:00:00"]);
  });

  it("does not invent weekend service from the weekday schedule", () => {
    expect(() => parse({}, saturday)).toThrow("no service defined for today in Sofia");
    expect(() => parse({}, Date.parse("2026-11-01T09:00:00Z"))).toThrow("no service defined for today in Sofia");
  });

  it("adds a service on exactly its exception date, without copying it to Sunday", () => {
    const changes = exceptions("WK,20261031,1\n");
    expect(parse(changes, saturday).items.map(item => item.key)).toEqual(["r1"]);
    expect(() => parse(changes, Date.parse("2026-11-01T09:00:00Z"))).toThrow("no service defined for today");
  });

  it("removes the current regular service rather than exposing an empty successful schedule", () => {
    expect(() => parse(exceptions("WK,20261030,2\n"))).toThrow("no service defined for today");
  });

  it("replaces the regular service with the published holiday timetable", () => {
    const result = parse(exceptions("WK,20261030,2\nHOL,20261030,1\n"));
    expect(result.items.map(item => item.key)).toEqual(["r2"]);
    expect(JSON.parse(String(result.items[0]?.fields.timetable))[0].stops[0].times).toEqual(["10:00:00"]);
  });

  it("applies exceptions independently of file order and leaves other dates unchanged", () => {
    expect(parse(exceptions("HOL,20261031,1\nWK,20261031,2\n")).items.map(item => item.key)).toEqual(["r1"]);
    expect(parse(exceptions("HOL,20261031,1\nWK,20261031,2\n"), saturday).items.map(item => item.key)).toEqual(["r2"]);
  });

  it("selects the Sofia date at local midnight rather than the UTC date", () => {
    const changes = exceptions("HOL,20261031,1\n");
    expect(parse(changes, Date.parse("2026-10-30T21:59:59Z")).items[0]?.fields.serviceDate).toBe("2026-10-30");
    const result = parse(changes, Date.parse("2026-10-30T22:00:00Z"));
    expect(result.items.map(item => item.key)).toEqual(["r2"]);
    expect(result.items[0]?.fields.serviceDate).toBe("2026-10-31");
  });

  it("retains the same service date across the repeated Sofia autumn hour", () => {
    const changes = {
      ...exceptions("HOL,20261025,1\n"),
      "feed_info.txt": fixture["feed_info.txt"]!.replace("20261030", "20261025"),
    };
    for (const instant of ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"]) {
      const result = parse(changes, Date.parse(instant));
      expect(result.items.map(item => item.key)).toEqual(["r2"]);
      expect(result.items[0]?.fields.serviceDate).toBe("2026-10-25");
    }
  });

  it("allows an explicit addition outside the baseline service interval", () => {
    expect(parse({
      ...exceptions("WK,20261031,1\n"),
      "calendar.txt": calendarHeader + weekday.replace("20261231", "20261030") + holiday,
    }, saturday).items.map(item => item.key)).toEqual(["r1"]);
  });

  it("supports fully enumerated dates without calendar.txt, with exact-date activation only", () => {
    const changes = { "calendar.txt": null, ...exceptions("WK,20261030,1\nHOL,20261031,1\n") };
    expect(parse(changes).items.map(item => item.key)).toEqual(["r1"]);
    expect(parse(changes, saturday).items.map(item => item.key)).toEqual(["r2"]);
    expect(() => parse(changes, Date.parse("2026-11-01T09:00:00Z"))).toThrow("no service defined for today");
  });

  it("requires at least one service calendar", () => {
    expect(() => parse({ "calendar.txt": null })).toThrow("service calendar missing");
  });
});

describe("GTFS exception and reference validation", () => {
  it.each([
    ["identical duplicate", "WK,20261030,1\nWK,20261030,1\n"],
    ["conflicting duplicate", "WK,20261030,1\nWK,20261030,2\n"],
    ["duplicate on a different date", "WK,20261031,1\nWK,20261031,2\n"],
  ])("rejects %s before publishing any route", (_label, rows) => {
    expect(() => parse(exceptions(rows))).toThrow("duplicate or conflicting calendar exception");
  });

  it("rejects duplicate service/date keys even when all dates are enumerated", () => {
    expect(() => parse({ "calendar.txt": null, ...exceptions("WK,20261030,1\nWK,20261030,1\nHOL,20261031,1\n") })).toThrow("duplicate or conflicting");
  });

  it.each([
    "WK,20260230,1\n", "WK,2026-10-30,1\n", "WK,,1\n",
    "WK,20261030,0\n", "WK,20261030,3\n", "WK,20261030,01\n", "WK,20261030,\n",
    ",20261030,1\n", " ,20261030,1\n",
  ])("rejects invalid exception row %j", row => {
    expect(() => parse(exceptions(row))).toThrow("invalid calendar exception");
  });

  it("rejects an exception referencing an unknown baseline service", () => {
    expect(() => parse(exceptions("UNKNOWN,20261030,1\n"))).toThrow("calendar exception references unknown service");
  });

  it.each([
    ["service_id,date\nWK,20261030\n", "missing required columns"],
    ["service_id,date,exception_type\nWK,20261030,1,extra\n", "row width changed"],
    ["service_id,date,exception_type,date\nWK,20261030,1,20261031\n", "duplicate or empty column"],
    ["service_id,date,exception_type\n\"WK,20261030,1\n", "broken CSV quotation"],
  ])("rejects malformed exception CSV", (csv, error) => {
    expect(() => parse({ "calendar_dates.txt": csv })).toThrow(error);
  });

  it.each([
    weekday + weekday + holiday,
    weekday.replace(",1,1,1,1,1,", ",2,1,1,1,1,") + holiday,
    weekday.replace("20261001,20261231", "20261231,20261001") + holiday,
    weekday.replace("20261001", "20260230") + holiday,
  ])("rejects duplicate or invalid baseline calendars", rows => {
    expect(() => parse({ "calendar.txt": calendarHeader + rows })).toThrow("invalid or duplicate service calendar");
  });

  it.each([
    ["r2,HOL,QA inactive,t1\n", "duplicate or missing trip ID"],
    ["r2,HOL,QA inactive,\n", "duplicate or missing trip ID"],
    ["missing,HOL,QA inactive,t3\n", "trip references unknown route or service"],
    ["r2,missing,QA inactive,t3\n", "trip references unknown route or service"],
  ])("validates inactive trip identities and references too", (row, error) => {
    expect(() => parse({ "trips.txt": fixture["trips.txt"]! + row })).toThrow(error);
  });

  it("rejects a duplicate inactive route", () => {
    expect(() => parse({ "routes.txt": fixture["routes.txt"]! + "r2,3,2,QA duplicate\n" })).toThrow("duplicate bus route");
  });

  it("rejects a stop time referencing a nonexistent trip", () => {
    expect(() => parse({ "stop_times.txt": fixture["stop_times.txt"]! + "unknown,s1,08:00:00,08:00:00,1\n" })).toThrow("stop time references unknown trip");
  });

  it("keeps active destination validation without requiring an inactive headsign", () => {
    expect(parse({ "trips.txt": fixture["trips.txt"]!.replace("QA празнична крайна", "") }).items).toHaveLength(1);
    expect(() => parse({ "trips.txt": fixture["trips.txt"]!.replace("QA делнична крайна", "") })).toThrow("active trip lacks route or destination");
  });
});

describe("GTFS pilot safety boundaries with calendar exceptions", () => {
  it("still refuses frequency-based schedules", () => {
    expect(() => parse({ ...exceptions("HOL,20261030,1\n"), "frequencies.txt": "trip_id,start_time,end_time,headway_secs\nt1,08:00:00,09:00:00,600\n" })).toThrow("frequency-based trips require separate validation");
  });

  it("requires the published agency timezone to stay Europe/Sofia", () => {
    expect(() => parse({ "agency.txt": "agency_timezone\nEtc/UTC\n" })).toThrow("service timezone changed");
  });

  it.each(["20261026", "20261101"])("rejects a stale or excessively future feed version %s", version => {
    expect(() => parse({ "feed_info.txt": fixture["feed_info.txt"]!.replace("20261030", version) })).toThrow("outside the current service window");
  });

  it("does not let an exception override feed freshness or the overall feed interval", () => {
    expect(() => parse({ ...exceptions("WK,20261030,1\n"), "feed_info.txt": "feed_start_date,feed_end_date,feed_version\n20261001,20261029,20261030\n" })).toThrow("outside the current service window");
    expect(() => parse({ "feed_info.txt": "feed_start_date,feed_end_date,feed_version\n20261231,20261001,20261030\n" })).toThrow("invalid feed interval");
  });

  it("keeps the compressed archive budget", () => {
    expect(() => parsePlovdivGtfsArchive(new Uint8Array(4_000_001), friday)).toThrow("archive exceeds pilot request budget");
  });

  it("counts calendar_dates toward the decompressed table budget", () => {
    expect(() => parse({ "calendar_dates.txt": "x".repeat(6_000_001) })).toThrow("extracted tables exceed pilot budget");
  });

  it("counts calendar_dates toward the combined decompressed budget", () => {
    expect(() => parse({ "calendar_dates.txt": "x".repeat(4_100_000), "stops.txt": "y".repeat(4_100_000) })).toThrow("extracted tables exceed pilot budget");
  });
});
