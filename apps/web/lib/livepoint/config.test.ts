import { describe, expect, it } from "vitest";
import { isLivePointModule, isTomTomConfigured, PLOVDIV } from "./config";
import { myNewsSchema, reportSchema } from "./forms/schema";

describe("livepoint config", () => {
  it("keeps Plovdiv coordinates as config", () => {
    expect(PLOVDIV.lat).toBeCloseTo(42.1354, 3);
    expect(PLOVDIV.lon).toBeCloseTo(24.7453, 3);
  });

  it("recognises module query values", () => {
    expect(isLivePointModule("weather")).toBe(true);
    expect(isLivePointModule("live")).toBe(false);
  });

  it("does not invent a TomTom connection", () => {
    // Without TOMTOM_API_KEY in the test env the tile stays disconnected.
    expect(isTomTomConfigured()).toBe(Boolean(process.env.TOMTOM_API_KEY?.trim()));
  });
});

describe("forms schema", () => {
  it("requires consent and a real description for reports", () => {
    expect(
      reportSchema.safeParse({
        kind: "road",
        place: "Център",
        description: "Кратко",
        consent: true,
      }).success,
    ).toBe(false);

    expect(
      reportSchema.safeParse({
        kind: "city",
        place: "Капана",
        description: "Има счупен тротоар до входа на улицата и пречи на хора с колички.",
        contact: "",
        consent: true,
      }).success,
    ).toBe(true);
  });

  it("keeps my-news separate and requires acknowledgements", () => {
    expect(
      myNewsSchema.safeParse({
        workingTitle: "Свидетел",
        whatHappened: "Видях как се развива ситуацията на площада и мога да опиша последователността.",
        whereWhen: "Пловдив, днес следобед",
        publishName: "Иван",
        contact: "ivan@example.com",
        rightsAck: true,
        factsAck: false,
      }).success,
    ).toBe(false);
  });
});
