import "server-only";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { staffFromRequest } from "./session";
import { auditContext } from "./audit-context";
import { persistAudit } from "./audit-store";
import { auditChanges, auditDescriptor, safeAuditInput, textValue, type AuditInput } from "./audit-metadata";
import { auditArticleLabels, auditSnapshot, snapshotLabel } from "./audit-snapshots";
import { AUDIT_AREAS, type AuditEntry, type AuditValue } from "./audit-types";

/** A bounded tee reads JSON metadata without consuming the handler's body. Never clone uploads. */
export async function auditRequestInput(request: Request): Promise<AuditInput> {
  const url = new URL(request.url);
  if (request.method === "GET" || request.method === "HEAD") return Object.fromEntries(url.searchParams);
  if (!request.headers.get("content-type")?.includes("application/json")) return {};
  const reader = request.clone().body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  const timer = setTimeout(() => { void reader.cancel().catch(() => undefined); }, 2_000);
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 512_000) return {};
      chunks.push(next.value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as AuditInput : {};
  } catch { return {}; }
  finally { clearTimeout(timer); void reader.cancel().catch(() => undefined); }
}

export function auditSearchText(entry: Omit<AuditEntry, "searchText">) {
  // Search both the object and exact changed values; credentials never enter details.
  return [entry.actorName, entry.actorEmail, entry.actorRole, AUDIT_AREAS[entry.area], entry.actionLabel, entry.entityId, entry.entityLabel, entry.ip, entry.path, JSON.stringify(entry.details)].join(" ");
}

export function withStaffAudit<Args extends unknown[]>(handler: (request: Request, ...args: Args) => Promise<Response>) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const startedAt = new Date().toISOString();
    const id = randomUUID();
    let actor: Awaited<ReturnType<typeof staffFromRequest>> = null;
    let sessionError: unknown;
    try { actor = await staffFromRequest(request); } catch (error) { sessionError = error; }
    const preliminary = auditDescriptor(new URL(request.url).pathname, request.method, {});
    // Unauthenticated probes and anonymous session polling are not employee actions.
    if (!actor && !sessionError && (preliminary.area !== "auth" || request.method === "GET")) return handler(request, ...args);
    const input = await auditRequestInput(request);
    const descriptor = auditDescriptor(new URL(request.url).pathname, request.method, input);
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    const context: Parameters<typeof auditContext.run>[0] = { id, actor, details: {} };
    return auditContext.run(context, async () => {
      let entityId = descriptor.entityId || (descriptor.area === "profile" ? actor?.id ?? "" : "");
      const snapshotInput = { ...input, auditAi: descriptor.path.includes("/podcasts/ai") };
      let before: AuditValue = null;
      let snapshotError = false;
      if (mutation && actor) {
        try { before = await auditSnapshot(descriptor.area, entityId, snapshotInput); }
        catch { snapshotError = true; }
      }
      const candidateIp = textValue(request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(), 80);
      let entry: AuditEntry = {
        id, startedAt, occurredAt: startedAt, actorId: actor?.id ?? null, actorName: actor?.name ?? "", actorEmail: actor?.email ?? "", actorRole: actor?.role ?? null,
        ...descriptor, entityId, entityLabel: snapshotLabel(before) || descriptor.entityLabel, targetPath: null,
        outcome: "pending", method: request.method, statusCode: null, durationMs: null, ip: isIP(candidateIp) ? candidateIp : "",
        userAgent: textValue(request.headers.get("user-agent"), 500), details: { request: safeAuditInput(input) }, searchText: "",
      };
      entry.searchText = auditSearchText(entry);
      const stored = await persistAudit(entry);
      if (!stored && mutation) return Response.json({ error: { code: "audit_unavailable", message: "Историята на действията е временно недостъпна. Опитайте отново." } }, { status: 503, headers: { "cache-control": "private, no-store" } });
      let response: Response | undefined;
      let thrown: unknown;
      try { if (sessionError) throw sessionError; response = await handler(request, ...args); } catch (error) { thrown = error; }
      const status = response?.status ?? 500;
      const success = status < 400 && !thrown;
      let result: AuditInput = {};
      if (response?.headers.get("content-type")?.includes("application/json")) {
        // Response bodies are never recorded wholesale (auth responses can contain tokens).
        try { result = await auditRequestInput(new Request("http://audit.local", { method: "POST", headers: { "content-type": "application/json" }, body: response.clone().body, duplex: "half" } as RequestInit)); } catch { /* Status still identifies the outcome. */ }
      }
      if (success) entityId ||= textValue(result.id || (result.poll as AuditInput | undefined)?.id);
      let after: AuditValue = null;
      if (success && mutation && actor) {
        try { after = await auditSnapshot(descriptor.area, entityId, { ...snapshotInput, auditRevision: typeof result.revision === "number" ? result.revision : undefined }); }
        catch { snapshotError = true; }
      }
      const details = { ...entry.details, ...context.details };
      entityId = textValue(context.details.entityId) || entityId;
      if (success && mutation) {
        const evidence = context.evidence ?? { before, after };
        details.changes = auditChanges(evidence.before, evidence.after) as unknown as AuditValue;
        details.stateSource = context.evidence ? "domain" : "request snapshots";
        if (snapshotError) details.detailsUnavailable = true;
        for (const key of ["id", "revision", "jobId", "path", "slug"]) if (typeof result[key] === "string" || typeof result[key] === "number") details[key] = result[key] as AuditValue;
        try { Object.assign(details, await auditArticleLabels(details)); } catch { details.articleTitlesUnavailable = true; }
      }
      if (!success) {
        const error = result.error;
        details.errorCode = typeof error === "object" && error ? textValue((error as AuditInput).code) || `HTTP ${status}` : `HTTP ${status}`;
      }
      const identified = context.actor;
      entry = { ...entry, actorId: identified?.id ?? null, actorName: identified?.name ?? "", actorEmail: identified?.email ?? "", actorRole: identified?.role ?? null,
        entityId, entityLabel: textValue(context.details.entityLabel) || snapshotLabel(after) || entry.entityLabel, occurredAt: new Date().toISOString(), durationMs: Math.max(0, Date.now() - new Date(startedAt).getTime()),
        statusCode: status, outcome: success ? "success" : "failure", details,
        targetPath: descriptor.area === "articles" && /^[\da-f-]{36}$/i.test(entityId) ? `/articles/${entityId}/` : null,
      };
      entry.searchText = auditSearchText(entry);
      await persistAudit(entry);
      if (thrown) throw thrown;
      return response!;
    });
  };
}
