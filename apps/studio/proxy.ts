import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { staffFromRequest } from "./lib/session";
import { persistAudit } from "./lib/audit-store";
import { auditDescriptor, safeAuditInput, textValue } from "./lib/audit-metadata";
import { auditSearchText } from "./lib/audit";
import type { AuditEntry } from "./lib/audit-types";

export async function proxy(request: NextRequest) {
  if (request.method !== "GET" || request.headers.has("next-router-prefetch") || /prefetch/i.test(`${request.headers.get("purpose") || ""} ${request.headers.get("sec-purpose") || ""}`)) return NextResponse.next();
  try {
    const staff = await staffFromRequest(request);
    if (staff) {
      const now = new Date().toISOString();
      const descriptor = auditDescriptor(new URL(request.url).pathname, "GET", Object.fromEntries(new URL(request.url).searchParams));
      const entry: AuditEntry = { ...descriptor, id: randomUUID(), startedAt: now, occurredAt: now, actorId: staff.id, actorName: staff.name, actorEmail: staff.email, actorRole: staff.role,
        action: `${descriptor.area}.open`, actionLabel: "Отваряне на екран", entityLabel: descriptor.path, targetPath: null,
        outcome: "access", method: "GET", statusCode: null, durationMs: null, ip: "", userAgent: textValue(request.headers.get("user-agent"), 500),
        details: { request: safeAuditInput(Object.fromEntries(new URL(request.url).searchParams)) }, searchText: "" };
      entry.searchText = auditSearchText(entry); await persistAudit(entry);
    }
  } catch (error) {
    // Navigation must not fail if the journal is temporarily unavailable.
    console.error("Studio audit proxy skipped", error instanceof Error ? error.message : error);
  }
  return NextResponse.next();
}

// Next strips internal Flight headers before proxy(): exclude prefetch at matching time.
const missingPrefetch = [
  { type: "header" as const, key: "next-router-prefetch" },
  { type: "header" as const, key: "purpose", value: "prefetch" },
  { type: "header" as const, key: "sec-purpose", value: ".*prefetch.*" },
];

// Explicit "/" is required with basePath `/admin`: catch-all matchers alone can skip the
// studio root and return an empty 200 (Next.js basePath + middleware matcher bug).
export const config = { matcher: [
  { source: "/", missing: missingPrefetch },
  { source: "/((?!api(?:/|$)|_next(?:/|$)|favicon\\.ico|.*\\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|css|js)$).*)", missing: missingPrefetch },
] };
