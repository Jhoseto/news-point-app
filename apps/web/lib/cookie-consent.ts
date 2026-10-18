/** This is a visitor preference, never an authentication or permissions token. */
export const CONSENT_COOKIE = "np_consent";
export const CONSENT_POLICY = "2026-10-18.1";
export const CONSENT_MAX_AGE = 180 * 86400;
export type ConsentChoices = { preferences: boolean; statistics: boolean; external: boolean };
export type ConsentRecord = ConsentChoices & { version: 1; policy: string; savedAt: number; expiresAt: number; action: "all" | "selection" };
export const NO_OPTIONAL_CONSENT: ConsentChoices = { preferences: false, statistics: false, external: false };
export const ALL_OPTIONAL_CONSENT: ConsentChoices = { preferences: true, statistics: true, external: true };
export const OPEN_COOKIE_SETTINGS = "np-open-cookie-settings";

export function createConsent(choices: ConsentChoices, action: ConsentRecord["action"], now = Date.now()): ConsentRecord {
  return { version: 1, policy: CONSENT_POLICY, savedAt: now, expiresAt: now + CONSENT_MAX_AGE * 1000,
    preferences: choices.preferences === true, statistics: choices.statistics === true, external: choices.external === true, action };
}

export function parseConsent(raw: string | undefined | null, now = Date.now()): ConsentRecord | null {
  if (!raw || raw.length > 1024) return null;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(raw));
    if (!value || typeof value !== "object") return null;
    const record = value as Partial<ConsentRecord>;
    if (record.version !== 1 || record.policy !== CONSENT_POLICY
      || typeof record.preferences !== "boolean" || typeof record.statistics !== "boolean" || typeof record.external !== "boolean"
      || (record.action !== "all" && record.action !== "selection")
      || !Number.isSafeInteger(record.savedAt) || !Number.isSafeInteger(record.expiresAt)
      || record.savedAt! > now + 60_000 || record.savedAt! < 0 || record.expiresAt! <= now
      || record.expiresAt! - record.savedAt! !== CONSENT_MAX_AGE * 1000
      || (record.action === "all" && (!record.preferences || !record.statistics || !record.external))) return null;
    return { version: 1, policy: CONSENT_POLICY, savedAt: record.savedAt!, expiresAt: record.expiresAt!,
      preferences: record.preferences, statistics: record.statistics, external: record.external, action: record.action };
  } catch { return null; }
}

export function consentFromCookieHeader(header: string, now = Date.now()): ConsentRecord | null {
  const value = header.split(";").map(part => part.trim()).find(part => part.startsWith(`${CONSENT_COOKIE}=`))?.slice(CONSENT_COOKIE.length + 1);
  return parseConsent(value, now);
}

export function serializeConsent(record: ConsentRecord, secure: boolean): string {
  return `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(record))}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
