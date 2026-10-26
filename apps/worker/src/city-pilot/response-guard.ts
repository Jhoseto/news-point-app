export class CityResponseError extends Error {
  constructor(public readonly reason: "access-challenge" | "access-denied" | "rate-limited" | "pending-response" | "http-error", status: number) {
    super(`HTTP ${status}: ${reason}`);
  }
}

/** Classify responses before 304 reuse or parsing; never execute a challenge. */
export function guardCityResponse(response: Response): void {
  if (response.headers.get("cf-mitigated") === "challenge" || /^(?:challenge|captcha)$/iu.test(response.headers.get("x-amzn-waf-action") ?? ""))
    throw new CityResponseError("access-challenge", response.status);
  if ([401, 403].includes(response.status)) throw new CityResponseError("access-denied", response.status);
  if (response.status === 429) throw new CityResponseError("rate-limited", response.status);
  if (response.status === 202) throw new CityResponseError("pending-response", response.status);
  if (response.status !== 304 && !response.ok) throw new CityResponseError("http-error", response.status);
}
