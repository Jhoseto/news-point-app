import { describe, expect, it } from "vitest";
import { publicAnalyticsEnabled, readPublicAnalyticsConfig } from "./public-analytics";

const prodEnv = {
  NODE_ENV: "production",
  WEB_URL: "https://newspoint.bg",
  NP_PUBLIC_INDEXING: "1",
  NEXT_PUBLIC_GTM_ID: "GTM-ABCDEFG",
};

describe("publicAnalytics", () => {
  it("accepts GTM and GA4 ids", () => {
    expect(readPublicAnalyticsConfig({ NEXT_PUBLIC_GTM_ID: "GTM-ABC123" })).toEqual({
      kind: "gtm",
      containerId: "GTM-ABC123",
    });
    expect(readPublicAnalyticsConfig({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-G123456789" })).toEqual({
      kind: "ga4",
      measurementId: "G-G123456789",
    });
    expect(readPublicAnalyticsConfig({ NEXT_PUBLIC_GTM_ID: "bad" })).toBeNull();
  });

  it("prefers GTM when both are set", () => {
    expect(
      readPublicAnalyticsConfig({
        NEXT_PUBLIC_GTM_ID: "GTM-ABC123",
        NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-G123456789",
      })?.kind,
    ).toBe("gtm");
  });

  it("loads only with indexing or explicit analytics opt-in", () => {
    expect(publicAnalyticsEnabled(prodEnv)).toBe(true);
    expect(publicAnalyticsEnabled({ ...prodEnv, NP_PUBLIC_INDEXING: "0" })).toBe(false);
    expect(publicAnalyticsEnabled({ ...prodEnv, NP_PUBLIC_INDEXING: "0", NP_PUBLIC_ANALYTICS: "1" })).toBe(true);
    expect(publicAnalyticsEnabled({ ...prodEnv, NEXT_PUBLIC_GTM_ID: "" })).toBe(false);
  });
});
