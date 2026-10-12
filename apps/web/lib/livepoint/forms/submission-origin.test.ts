import { describe, expect, it } from "vitest";
import { isSubmissionOrigin } from "./submission-origin";

const req = (origin?: string, extra: Record<string, string> = {}) => new Request("http://localhost:3100/api/livepoint/report/", {
  headers: { ...(origin ? { origin } : {}), ...extra },
});
describe("reader form origin behind a proxy", () => {
  it("accepts the configured public HTTPS origin while the internal URL is HTTP", () => {
    expect(isSubmissionOrigin(req("https://reader.test"), "https://reader.test/")).toBe(true);
    expect(isSubmissionOrigin(req("http://localhost:3100"), "https://reader.test")).toBe(true);
  });
  it.each([undefined, "null", "https://reader.test.evil.test", "http://reader.test", "https://reader.test:444", "https://reader.test/path"])("rejects a foreign, missing or malformed Origin %s", origin => {
    expect(isSubmissionOrigin(req(origin), "https://reader.test")).toBe(false);
  });
  it("does not trust forged forwarding headers or cross-site metadata", () => {
    expect(isSubmissionOrigin(req("https://evil.test", { "x-forwarded-host": "evil.test", "x-forwarded-proto": "https" }), "https://reader.test")).toBe(false);
    expect(isSubmissionOrigin(req("https://reader.test", { "sec-fetch-site": "cross-site" }), "https://reader.test")).toBe(false);
  });
  it.each(["bad-url", "ftp://reader.test", "https://user:password@reader.test"])("fails closed with invalid configuration %s", config => {
    expect(isSubmissionOrigin(req("https://reader.test"), config)).toBe(false);
  });
});
