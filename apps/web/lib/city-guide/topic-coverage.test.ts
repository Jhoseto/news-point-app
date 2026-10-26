import { describe, expect, it } from "vitest";
import { cityAvailableTopics } from "./topic-coverage";
import type { CityObservation } from "./local-observations";

function group(sourceId: string, status: CityObservation["status"] = "observed", count = 1): CityObservation {
  return { sourceId, status, checkedAt: "2026-10-26T10:00:00.000Z", completeness: "uncertain", items: Array.from({ length: count }, (_, index) => ({ key: String(index), fields: {} })) };
}

describe("city navigation coverage", () => {
  it("lists only topics with current records in catalog order", () => {
    expect(cityAvailableTopics("transport", [group("plovdiv-transit"), group("plovdiv-airport-flights"), group("plovdiv-livetransport-gtfs", "stale")])).toEqual([
      { title: "Извън града", href: "#nablyudavani-plovdiv-airport-flights" },
      { title: "Билети и карти", href: "#nablyudavani-plovdiv-transit" },
    ]);
  });

  it("does not advertise empty or failed categories", () => {
    expect(cityAvailableTopics("adopt", [group("plovdiv-dog-shelter", "unavailable"), group("plovdiv-adoption-guide", "observed", 0)])).toEqual([]);
  });

  it("opens the Youth Center panel only when a dated activity is present", () => {
    expect(cityAvailableTopics("culture", [group("plovdiv-youth-centre")])).toContainEqual({ title: "Срещи и работилници", href: "#agenda-community" });
    expect(cityAvailableTopics("culture", [group("plovdiv-youth-centre", "observed", 0)])).toEqual([]);
  });

  it("shows live music and stand-up topics only when matching event titles are present", () => {
    const events = group("epaygo-plovdiv-explicit");
    events.items = [{ key: "live", fields: { title: "Band - Live at Rock Bar" } }];
    expect(cityAvailableTopics("nightlife", [events])).toContainEqual({ title: "Музика на живо", href: "#agenda-live" });
    expect(cityAvailableTopics("nightlife", [events]).map(topic => topic.title)).not.toContain("Стендъп");
    events.items.push({ key: "standup", fields: { title: "Stand-up Comedy" } });
    expect(cityAvailableTopics("nightlife", [events])).toContainEqual({ title: "Стендъп", href: "#agenda-standup" });
    expect(cityAvailableTopics("nightlife", [group("club-code-upcoming")])).toContainEqual({ title: "Партита", href: "#agenda-party" });
  });

  it("links municipal housing directly to verified guidance and hides a failed read", () => {
    expect(cityAvailableTopics("municipality", [group("plovdiv-housing")])).toContainEqual({ title: "Общински жилища", href: "#nablyudavani-plovdiv-housing" });
    expect(cityAvailableTopics("municipality", [group("plovdiv-housing", "unavailable")])).toEqual([]);
  });
  it("links public consultations only while an active dated record is present", () => {
    expect(cityAvailableTopics("municipality", [group("plovdiv-public-consultations")])).toContainEqual({ title: "Обществени обсъждания", href: "#nablyudavani-plovdiv-public-consultations" });
    expect(cityAvailableTopics("municipality", [group("plovdiv-public-consultations", "observed", 0)])).toEqual([]);
  });
  it("links management competitions only while an open record exists", () => {
    expect(cityAvailableTopics("municipality", [group("plovdiv-management-competitions")])).toContainEqual({ title: "Работа в общината", href: "#nablyudavani-plovdiv-management-competitions" });
    expect(cityAvailableTopics("municipality", [group("plovdiv-management-competitions", "observed", 0)])).toEqual([]);
  });
  it("does not advertise contact-only references or docket numbers as substantive topics", () => {
    expect(cityAvailableTopics("municipality", [group("plovdiv-eco-signals"), group("plovdiv-transport-signals"), group("plovdiv-council"), group("plovdiv-taxes")])).toEqual([]);
    expect(cityAvailableTopics("environment", [group("plovdiv-eco-signals")])).toEqual([]);
  });
});
