import { describe, expect, it } from "vitest";
import { cityEventId, cityEventPath, cityEventSchema, decodeCityEventId, validCityEventId } from "./event-page";
import type { AgendaEvent } from "./event-agenda";
import { serializeGraph } from "../jsonld";

const event: AgendaEvent = { id: "fixture:Пловдив / 19:00?x=1#тест", title: "Проверочно събитие", kind: "theatre", date: "2026-11-01", endDate: "2026-11-01", time: "19:00", place: "Проверочна зала", address: "Проверочен адрес 1", image: null, status: "", price: null };

describe("city event URLs", () => {
  it("keeps arbitrary Unicode IDs in one URL-safe segment without collisions or double escaping", () => {
    const ids = [event.id, `${event.id}%`, `${event.id}/`, `${event.id}🎭`, "fixture:é", "fixture:e"];
    expect(new Set(ids.map(cityEventId)).size).toBe(ids.length);
    for (const value of ids) {
      const id = cityEventId(value);
      expect(validCityEventId(id)).toBe(true);
      expect(decodeCityEventId(id)).toBe(value);
      expect(cityEventPath(value)).toBe(`/moyat-plovdiv/events/${id}/`);
      expect(decodeURIComponent(cityEventPath(value))).toBe(cityEventPath(value));
      const encoded = id.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      expect(new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)))).toBe(value);
    }
  });
  it.each(["../x", "%2F", "e-", "e-a/b", "e-" + "a".repeat(2001)])("rejects unsafe or unbounded route identifier %s", value => expect(validCityEventId(value)).toBe(false));
  it.each(["e-a", "e-_w", "e-YR", "e-YQ==", "e-YQ/"])("rejects invalid UTF-8, noncanonical or malformed encoding %s", value => expect(decodeCityEventId(value)).toBeNull());
});

describe("honest Event structured data", () => {
  it("uses only genuine date/address data and never invents time, offers, image, organizer or status", () => {
    const result = cityEventSchema(event, "https://newspoint.bg/fixture/")!;
    expect(result.startDate).toBe("2026-11-01");
    expect(result.location).toEqual({ "@type": "Place", name: event.place, address: event.address });
    for (const field of ["offers", "image", "organizer", "eventStatus"]) expect(result).not.toHaveProperty(field);
  });
  it.each([{ address: "" }, { place: "" }, { date: "2026-02-30" }, { endDate: "2026-10-01" }, { recurrence: "Всеки петък" }])("omits schema for unsupported event fields %o", changes => expect(cityEventSchema({ ...event, ...changes }, "https://newspoint.bg/fixture/")).toBeNull());
  it("preserves explicit cancellation and safely serializes source text", () => {
    const result = cityEventSchema({ ...event, status: "EventCancelled", description: "</script><script>alert(1)</script>" }, "https://newspoint.bg/fixture/")!;
    expect(result.eventStatus).toBe("https://schema.org/EventCancelled");
    expect(serializeGraph([result])).not.toContain("</script>");
  });
  it("includes only the guarded same-origin public image route", () => {
    const image = "/moyat-plovdiv/event-image/?category=culture&hash=fixture";
    expect(cityEventSchema({ ...event, image }, "https://newspoint.bg/fixture/")).toHaveProperty("image", `https://newspoint.bg${image}`);
    for (const value of ["https://external.example/image", "//external.example/image", "/api/city-guide/event-image?hash=fixture"]) {
      expect(cityEventSchema({ ...event, image: value }, "https://newspoint.bg/fixture/")).not.toHaveProperty("image");
    }
  });
});
