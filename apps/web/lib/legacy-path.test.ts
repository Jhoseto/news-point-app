import { describe, expect, it } from "vitest";
import { legacyPathCandidates } from "./legacy-path";

describe("imported WordPress path lookup", () => {
  it("finds the real archive path with a percent-encoded Cyrillic letter", () => {
    const decoded = "/diana-rusinova-dashterya-ѝ-v-tol/";
    expect(legacyPathCandidates(decoded)).toEqual([
      decoded, "/diana-rusinova-dashterya-%D1%9D-v-tol/", "/diana-rusinova-dashterya-%d1%9d-v-tol/",
    ]);
  });
  it("keeps ordinary paths exact and first without changing ASCII case", () => {
    expect(legacyPathCandidates("/News-2026/")).toEqual(["/News-2026/"]);
  });
  it("encodes Unicode in each segment without changing separators", () => {
    expect(legacyPathCandidates("/новини/Пловдив/")[1]).toBe("/%D0%BD%D0%BE%D0%B2%D0%B8%D0%BD%D0%B8/%D0%9F%D0%BB%D0%BE%D0%B2%D0%B4%D0%B8%D0%B2/");
  });
  it("preserves percent literals and does not decode escapes into path separators", () => {
    expect(legacyPathCandidates("/literal%2Fpercent%/ѝ/")[1]).toBe("/literal%2Fpercent%/%D1%9D/");
    expect(legacyPathCandidates("/literal%/")).toEqual(["/literal%/"]);
  });
});
