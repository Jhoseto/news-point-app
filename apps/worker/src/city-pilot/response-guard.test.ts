import { expect, it } from "vitest";
import { guardCityResponse } from "./response-guard";
it("does not confuse a challenge, denial, rate limit or pending response with changed source markup", () => {
  for (const [status, headers, reason] of [
    [200, { "cf-mitigated": "challenge" }, "access-challenge"],
    [304, { "cf-mitigated": "challenge" }, "access-challenge"],
    [202, { "x-amzn-waf-action": "captcha" }, "access-challenge"],
    [403, {}, "access-denied"], [429, {}, "rate-limited"], [202, {}, "pending-response"], [503, {}, "http-error"],
  ] as const) expect(() => guardCityResponse(new Response(null, { status, headers }))).toThrow(`HTTP ${status}: ${reason}`);
  expect(() => guardCityResponse(new Response(null, { status: 200 }))).not.toThrow();
  expect(() => guardCityResponse(new Response(null, { status: 304 }))).not.toThrow();
});
