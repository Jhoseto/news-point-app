import { beforeEach, describe, expect, it, vi } from "vitest";
const forecast = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/livepoint/weather/met-norway", () => ({ getWeatherForecast: forecast }));
import { GET } from "./route";

const request = (query = "") => new Request(`https://newspoint.bg/api/livepoint/weather/${query}`);
beforeEach(() => forecast.mockReset().mockResolvedValue({ status: "ok", payload: { cityId: "plovdiv" } }));

describe("weather API city contract", () => {
  it("preserves the default and routes an explicit supported city", async () => {
    const defaultResponse = await GET(request());
    expect(forecast).toHaveBeenLastCalledWith("plovdiv");
    expect(defaultResponse.headers.get("cache-control")).toContain("public");
    await GET(request("?city=smolyan"));
    expect(forecast).toHaveBeenLastCalledWith("smolyan");
  });
  it.each(["?city=", "?city=unknown", "?city=__proto__", "?city=sofia&city=plovdiv", "?city=https%3A%2F%2Fexample.com"])("rejects invalid city %s without upstream work", async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_CITY" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(forecast).not.toHaveBeenCalled();
  });
  it("never derives location from cookies or IP, or caches outages", async () => {
    forecast.mockResolvedValue({ status: "unavailable", payload: null });
    const response = await GET(new Request("https://newspoint.bg/api/livepoint/weather/?lat=0&lon=0", {
      headers: { cookie: "weatherCity=sofia", "x-forwarded-for": "192.0.2.1" },
    }));
    expect(forecast).toHaveBeenCalledWith("plovdiv");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
