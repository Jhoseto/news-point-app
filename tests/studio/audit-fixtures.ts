import type { AuditEntry } from "../../apps/studio/lib/audit-types";
export const auditFixture = (patch: Partial<AuditEntry> = {}): AuditEntry => ({
  id: "11111111-1111-4111-8111-111111111111", startedAt: "2026-10-12T09:00:00.000Z", occurredAt: "2026-10-12T09:00:00.250Z",
  actorId: "qa-editor", actorName: "QA редактор", actorEmail: "qa@example.test", actorRole: "editor", area: "articles", action: "articles.revision", actionLabel: "Запазване на редакция",
  entityKind: "articles", entityId: "22222222-2222-4222-8222-222222222222", entityLabel: "[QA] Материал", targetPath: null, outcome: "success", method: "POST",
  path: "/api/editor/articles/22222222-2222-4222-8222-222222222222/revisions", statusCode: 200, durationMs: 250, ip: "127.0.0.1", userAgent: "QA", details: {}, searchText: "QA редактор материал 100% 50_точки", ...patch,
});
