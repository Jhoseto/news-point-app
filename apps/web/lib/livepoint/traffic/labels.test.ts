import { describe, expect, it } from "vitest";
import { bulgarianIncidentDescription, bulgarianTrafficPlace, trafficFilterForCategory } from "./labels";

describe("TomTom traffic labels", () => {
  it.each([
    ["Stationary traffic", "Спряло движение"],
    ["Queuing traffic", "Колона от автомобили"],
    ["Slow traffic", "Забавено движение"],
    ["Closed", "Затворен участък"],
    ["Roadworks", "Ремонтни дейности"],
  ])("translates %s without changing its meaning", (source, expected) => {
    expect(bulgarianIncidentDescription(source, "Задръстване")).toBe(expected);
  });

  it("uses the confirmed category when TomTom sends an unknown phrase", () => {
    expect(bulgarianIncidentDescription("Unknown provider wording", "Пътни работи")).toBe("Пътни работи");
  });

  it("keeps congestion, restrictions and roadworks separate", () => {
    expect(trafficFilterForCategory(6)).toBe("congestion");
    expect(trafficFilterForCategory(7)).toBe("restrictions");
    expect(trafficFilterForCategory(8)).toBe("restrictions");
    expect(trafficFilterForCategory(9)).toBe("roadworks");
    expect(trafficFilterForCategory(1)).toBe("other");
  });

  it("renders romanized road names in Bulgarian", () => {
    expect(bulgarianTrafficPlace("bulevard Hristo Botev (bulevard Koprivschica)"))
      .toBe("булевард Христо Ботев (булевард Копривщица)");
    expect(bulgarianTrafficPlace("zhk Trakiya (ulica Saedinenie)"))
      .toBe("жк Тракия (улица Съединение)");
    expect(bulgarianTrafficPlace("улица Орфей")).toBe("улица Орфей");
  });
});
