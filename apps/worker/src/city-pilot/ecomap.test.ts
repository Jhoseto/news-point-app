import { describe, expect, it } from "vitest";
import { parseEcomapContainers } from "./parse";

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
