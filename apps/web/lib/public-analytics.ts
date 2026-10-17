import { publicIndexingEnabled } from "./indexing-policy.mjs";

const GTM_ID = /^GTM-[A-Z0-9]+$/;
const GA_ID = /^G-[A-Z0-9]+$/;

export type PublicAnalyticsConfig =
  | { kind: "gtm"; containerId: string }
  | { kind: "ga4"; measurementId: string };

function readId(env: Record<string, string | undefined>, key: string, pattern: RegExp): string | null {
  const raw = env[key]?.trim();
  if (!raw || !pattern.test(raw)) return null;
  return raw;
}

/** Same production gate as indexing, unless NP_PUBLIC_ANALYTICS=1 for a controlled preview test. */
export function publicAnalyticsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (!readPublicAnalyticsConfig(env)) return false;
  return publicIndexingEnabled(env) || env.NP_PUBLIC_ANALYTICS === "1";
}

export function readPublicAnalyticsConfig(
  env: Record<string, string | undefined> = process.env,
): PublicAnalyticsConfig | null {
  const gtmId = readId(env, "NEXT_PUBLIC_GTM_ID", GTM_ID);
  if (gtmId) return { kind: "gtm", containerId: gtmId };
  const measurementId = readId(env, "NEXT_PUBLIC_GA_MEASUREMENT_ID", GA_ID);
  if (measurementId) return { kind: "ga4", measurementId };
  return null;
}
