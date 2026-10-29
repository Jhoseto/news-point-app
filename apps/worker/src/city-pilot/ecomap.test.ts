import { describe, expect, it } from "vitest";
import { parseEcomapContainers, parseEcopackContainers } from "./parse";

function cityPoints() {
  return Array.from({ length: 1500 }, (_, index) => ({
    id: index + 1,
    type: index % 2 ? "tekstil" : "yellow",
    latitude: "42.1354000",
    longitude: "24.7453000",
    address: `ул. Пример ${index + 1}, Пловдив`,
    description: index === 0 ? "<p>До парка</p>" : null,
  }));
}

describe("EcoMap public container API", () => {
  it("retains stable IDs and plain location text without assuming capacity", () => {
    const snapshot = parseEcomapContainers(JSON.stringify(cityPoints()));
    expect(snapshot.items).toHaveLength(1500);
    expect(snapshot.items[0]?.fields).toMatchObject({ type: "yellow", latitude: 42.1354, description: "До парка" });
    expect(snapshot.items[0]?.fields).not.toHaveProperty("available");
    expect(snapshot.completeness).toBe("uncertain");
  });

  it("accepts the observed black container type", () => {
    const points = cityPoints();
    points[0]!.type = "black";
    const snapshot = parseEcomapContainers(JSON.stringify(points));
    expect(snapshot.items[0]?.fields.type).toBe("black");
  });

  it("rejects duplicate identities, out-of-bounds points and truncated results", () => {
    const duplicate = cityPoints();
    duplicate[1]!.id = 1;
    expect(() => parseEcomapContainers(JSON.stringify(duplicate))).toThrow("duplicate key");
    const outside = cityPoints();
    outside[1]!.latitude = "43.0000000";
    expect(() => parseEcomapContainers(JSON.stringify(outside))).toThrow("out-of-bounds");
    expect(() => parseEcomapContainers(JSON.stringify(cityPoints().slice(0, 100)))).toThrow("count outside observed range");
  });
});

describe("Ecopack public GeoJSON", () => {
  function collection() {
    return { type: "FeatureCollection", features: Array.from({ length: 5_000 }, (_, index) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: index < 242 ? [24.7453, 42.1354] : [27.45, 42.5] },
      properties: {
        id: index + 1,
        address: `Адрес ${index + 1}`,
        city: index < 242 ? "гр. Пловдив" : "гр. Бургас",
        municipality: index < 242 ? "Пловдив" : "Бургас",
        zone: index < 121 ? "Централен" : index < 242 ? "Тракия" : null,
        status: "active",
        containers: ["blue", "yellow", "green"].map(type => ({ type, status: "active", is_active: true })),
      },
    })) };
  }

  it("keeps only active Plovdiv points and labels the partial coverage", () => {
    const snapshot = parseEcopackContainers(JSON.stringify(collection()));
    expect(snapshot.items).toHaveLength(726);
    expect(snapshot.items[0]?.fields).toMatchObject({ district: "Централен", latitude: 42.1354, longitude: 24.7453 });
    expect(snapshot.limitations.join(" ")).toContain("не е карта на всички контейнери");
  });

  it("rejects an unexpected active container type", () => {
    const data = collection();
    data.features[0]!.properties.containers[0]!.type = "black";
    expect(() => parseEcopackContainers(JSON.stringify(data))).toThrow("unknown active container type");
  });
});
