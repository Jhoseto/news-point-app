import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Staff } from "./session";
import type { AuditDetails, AuditValue } from "./audit-types";

interface AuditContext { id: string; actor: Staff | null; details: AuditDetails; evidence?: { before: AuditValue; after: AuditValue }; }
const globalContext = globalThis as typeof globalThis & { __npStudioAudit?: AsyncLocalStorage<AuditContext> };
export const auditContext = globalContext.__npStudioAudit ??= new AsyncLocalStorage<AuditContext>();
export const auditActive = () => Boolean(auditContext.getStore());

/** Only a successful server-side authentication hook may identify a new login. */
export function identifyAuditActor(actor: Staff) {
  const context = auditContext.getStore();
  if (!context) return;
  if (!context.actor) context.actor = actor;
  else context.details.authenticatedAccount = { id: actor.id, name: actor.name, email: actor.email, role: actor.role };
}

/** Called with validated domain data, never with credentials or raw request bodies. */
export function auditFacts(details: AuditDetails) {
  const context = auditContext.getStore();
  if (context) Object.assign(context.details, details);
}

/** Capture state while the domain transaction holds its locks. Rolled-back requests are failures. */
export function auditEvidence(before: unknown, after: unknown) {
  const context = auditContext.getStore();
  if (context) context.evidence = { before: JSON.parse(JSON.stringify(before)) as AuditValue, after: JSON.parse(JSON.stringify(after)) as AuditValue };
}
