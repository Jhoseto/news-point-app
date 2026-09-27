import { describe, expect, it } from "vitest";
import { isValidReportContact } from "./contact";
import { geolocationErrorMessage, reportPositionSchema, requestDeviceLocation } from "./location";
import { reportSchema } from "./schema";

const report = { kind: "road", place: "Пловдив, ул. Иван Вазов", position: { lat: 42.1354, lon: 24.7453 }, description: "Има счупена настилка пред входа на сградата от тази сутрин.", consent: true };

describe("report contact", () => {
  it.each(["0888123456", "02 123 4567", "0 (888) 123-456", "+359 888 123 456", "+44 20 7946 0958", " name+news@example.com "])("accepts %s", contact => {
    expect(isValidReportContact(contact)).toBe(true);
    expect(reportSchema.safeParse({ ...report, contact }).success).toBe(true);
  });
  it.each(["", " ", "0888", "888123456", "359888123456", "(0888) 123456", "+0001234567", "+1", "+359888123456789012", "0888abc456", "0888123456 ext 2", "0(888123456", "name@example", "name@@example.com", "a..b@example.com", "name@-example.com", "name@example-.com", "name@example.com<script>", "name @example.com", `${"a".repeat(65)}@example.com`, `name@${"a".repeat(64)}.com`])("rejects %s on both client and server", contact => {
    expect(isValidReportContact(contact)).toBe(false);
    expect(reportSchema.safeParse({ ...report, contact }).success).toBe(false);
  });
  it("requires contact and exact coordinates independently", () => {
    expect(reportSchema.safeParse(report).success).toBe(false);
    expect(reportSchema.safeParse({ ...report, position: undefined, contact: "ivan@example.com" }).success).toBe(false);
    expect(reportSchema.safeParse({ ...report, position: { lat: "42", lon: 24 }, contact: "ivan@example.com" }).success).toBe(false);
  });
});

describe("report position", () => {
  it.each([{ lat: NaN, lon: 24 }, { lat: 42, lon: Infinity }, { lat: 86, lon: 24 }, { lat: 42, lon: 181 }])("rejects invalid coordinate $lat/$lon", point => {
    expect(reportPositionSchema.safeParse(point).success).toBe(false);
  });
  it("keeps permission denied, timeout and unavailable messages actionable", () => {
    expect(geolocationErrorMessage(1)).toContain("отказан");
    expect(geolocationErrorMessage(3)).toContain("навреме");
    expect(geolocationErrorMessage(2)).toContain("не е достъпно");
  });
});

describe("explicit device location request", () => {
  it("requests a fresh accurate position once and preserves coordinates", async () => {
    let calls = 0;
    const result = await requestDeviceLocation({ getCurrentPosition(success, _error, options) {
      calls += 1;
      expect(options).toEqual({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 });
      success({ coords: { latitude: 42.1354567, longitude: 24.7453456, accuracy: 12.4 } } as GeolocationPosition);
    } });
    expect(calls).toBe(1);
    expect(result).toEqual({ point: { lat: 42.1354567, lon: 24.7453456 }, accuracy: 12 });
  });
  it.each([1, 2, 3])("handles device error %s without creating a point", async code => {
    await expect(requestDeviceLocation({ getCurrentPosition(_success, error) {
      error?.({ code } as GeolocationPositionError);
    } })).rejects.toThrow(geolocationErrorMessage(code));
  });
  it("rejects invalid coordinates returned by a device", async () => {
    await expect(requestDeviceLocation({ getCurrentPosition(success) {
      success({ coords: { latitude: NaN, longitude: 24, accuracy: 1 } } as GeolocationPosition);
    } })).rejects.toThrow("извън обхвата");
  });
});
