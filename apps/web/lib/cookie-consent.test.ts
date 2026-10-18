import { describe, expect, it } from "vitest";
import { ALL_OPTIONAL_CONSENT, NO_OPTIONAL_CONSENT, CONSENT_MAX_AGE, consentFromCookieHeader, createConsent, parseConsent, serializeConsent } from "./cookie-consent";

const now = Date.UTC(2026, 9, 18, 12);
describe("explicit versioned cookie choices", () => {
  it("defaults to no optional categories and preserves an explicit refusal", () => {
    expect(NO_OPTIONAL_CONSENT).toEqual({ preferences: false, statistics: false, external: false });
    const record = createConsent(NO_OPTIONAL_CONSENT, "selection", now);
    expect(parseConsent(JSON.stringify(record), now)).toEqual(record);
    expect(record.expiresAt - record.savedAt).toBe(180 * 86400 * 1000);
  });
  it("preserves independent categories without persisting an identity or extraneous fields", () => {
    const record = createConsent({ preferences: true, statistics: false, external: true }, "selection", now);
    expect(parseConsent(JSON.stringify({ ...record, email: "must-not-persist" }), now)).toEqual(record);
    expect(consentFromCookieHeader(`other=x; ${serializeConsent(record, true)}`, now)).toEqual(record);
  });
  it("sets a bounded same-site first-party cookie with Secure on HTTPS", () => {
    const record = createConsent(ALL_OPTIONAL_CONSENT, "all", now);
    expect(serializeConsent(record, true)).toContain(`; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax; Secure`);
    expect(serializeConsent(record, false)).not.toContain("Secure");
    expect(parseConsent(encodeURIComponent(JSON.stringify(record)), now)).toEqual(record);
  });
  it("expires the choice exactly at the deadline", () => {
    const record = createConsent(ALL_OPTIONAL_CONSENT, "all", now);
    expect(parseConsent(JSON.stringify(record), record.expiresAt - 1)).toEqual(record);
    expect(parseConsent(JSON.stringify(record), record.expiresAt)).toBeNull();
  });
  for (const change of [{ version: 2 }, { policy: "old" }, { statistics: "true" }, { external: undefined }, { action: "implicit" }, { expiresAt: now + 999 }, { savedAt: now + 120000 }, { savedAt: -1 }, { action: "all", statistics: false }]) {
    it(`fails closed for an invalid record: ${JSON.stringify(change)}`, () => {
      expect(parseConsent(JSON.stringify({ ...createConsent(ALL_OPTIONAL_CONSENT, "all", now), ...change }), now)).toBeNull();
    });
  }
  it("fails closed for malformed, missing, oversized and similarly named cookies", () => {
    for (const raw of [null, undefined, "", "%", "null", "true", "{}", "a".repeat(1025)]) expect(parseConsent(raw, now)).toBeNull();
    expect(consentFromCookieHeader(`other_np_consent=${encodeURIComponent(JSON.stringify(createConsent(ALL_OPTIONAL_CONSENT, "all", now)))}`, now)).toBeNull();
  });
});
