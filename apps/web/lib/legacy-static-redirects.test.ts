import { describe, expect, it } from "vitest";
import { buildCustomRoute } from "next/dist/lib/build-custom-route";
import { prepareDestination } from "next/dist/shared/lib/router/utils/prepare-destination";
import { legacyStaticRedirects } from "./legacy-static-redirects";

const rules = legacyStaticRedirects().map(rule => ({ ...rule, regex: new RegExp(buildCustomRoute("redirect", rule, ["/_next"]).regex) }));

describe("verified WordPress static page redirects", () => {
  it.each([["/za-nas/", "/team/"], ["/ekip/", "/team/"], ["/contacts/reklama/", "/advertising/"], ["/izprati-novina/", "/livepoint/my-news/"]])("permanently maps %s to its verified replacement", (path, destination) => {
    const rule = rules.find(candidate => candidate.regex.test(path));
    expect(rule).toMatchObject({ destination, statusCode: 301 });
    expect(rule).not.toHaveProperty("permanent");
  });

  it.each(["/team/", "/advertising/", "/livepoint/my-news/", "/", "/ekip/unknown/", "/za-nas/unknown/", "/contacts/reklama/unknown/", "/author/jasper/", "/missing-article/", "/za-nas-invalid/"])("does not redirect unrelated or canonical path %s", path => {
    expect(rules.some(rule => rule.regex.test(path))).toBe(false);
  });

  it("preserves tracking parameters without permitting a caller-selected destination", () => {
    for (const rule of rules) {
      const result = prepareDestination({ destination: rule.destination, params: {}, query: { utm_source: "archive", next: "https://other.example/" }, appendParamsToQuery: true });
      expect(result.parsedDestination.pathname).toBe(rule.destination);
      expect(result.parsedDestination.query).toEqual({ utm_source: "archive", next: "https://other.example/" });
    }
  });
});
