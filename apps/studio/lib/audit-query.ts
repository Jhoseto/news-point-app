import "server-only";
import { getDb, studioAuditLogs as logs } from "@newspoint/db";
import { and, asc, desc, eq, gte, ilike, lt, lte, ne, sql } from "drizzle-orm";
import { sofiaWallToUtc, utcToSofiaWall } from "@newspoint/content";
import { auditContext } from "./audit-context";
import { auditBufferedCount, flushAuditBuffer } from "./audit-store";
import { AUDIT_AREAS, type AuditEntry, type AuditFilters, type AuditView } from "./audit-types";

const choice = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T => allowed.includes(value as T) ? value as T : fallback;
export function auditFilters(params: URLSearchParams, now = new Date()): AuditFilters {
  const anchorInput = params.get("anchor");
  const anchor = anchorInput && Number.isFinite(Date.parse(anchorInput)) && Date.parse(anchorInput) <= now.getTime() ? new Date(anchorInput).toISOString() : now.toISOString();
  return {
    q: (params.get("q") ?? "").trim().slice(0, 240), actor: (params.get("actor") ?? "").slice(0, 200), area: choice(params.get("area"), Object.keys(AUDIT_AREAS), ""),
    action: (params.get("action") ?? "").slice(0, 120), outcome: choice(params.get("outcome"), ["pending", "success", "failure", "access", ""], ""),
    role: choice(params.get("role"), ["editor", "admin", "master_admin", ""], ""),
    period: choice(params.get("period"), ["today", "yesterday", "7d", "30d", "all", "custom"], "7d"),
    from: (params.get("from") ?? "").slice(0, 10), to: (params.get("to") ?? "").slice(0, 10),
    sort: choice(params.get("sort"), ["newest", "oldest", "actor", "action", "entity", "outcome", "duration"], "newest"),
    page: Math.max(1, Math.min(100_000, Math.trunc(Number(params.get("page")) || 1))),
    size: [25, 50, 100].includes(Number(params.get("size"))) ? Number(params.get("size")) : 50, anchor,
  };
}

function dayAfter(day: string, offset = 1) {
  const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
export function auditDateRange(filters: AuditFilters): { from: Date | null; to: Date | null } {
  const today = utcToSofiaWall(new Date(filters.anchor)).slice(0, 10);
  const midnight = (day: string) => sofiaWallToUtc(`${day}T00:00`);
  if (filters.period === "custom") return { from: validDay(filters.from) ? midnight(filters.from) : null, to: validDay(filters.to) ? midnight(dayAfter(filters.to)) : null };
  if (filters.period === "all") return { from: null, to: null };
  const offset = filters.period === "yesterday" ? -1 : filters.period === "7d" ? -6 : filters.period === "30d" ? -29 : 0;
  return { from: midnight(dayAfter(today, offset)), to: filters.period === "yesterday" ? midnight(today) : midnight(dayAfter(today)) };
}

export function auditWhere(filters: AuditFilters, excludeId?: string) {
  const range = auditDateRange(filters);
  return and(
    lte(logs.startedAt, new Date(filters.anchor)), excludeId ? ne(logs.id, excludeId) : undefined,
    range.from ? gte(logs.startedAt, range.from) : undefined, range.to ? lt(logs.startedAt, range.to) : undefined,
    filters.actor ? eq(logs.actorId, filters.actor) : undefined, filters.area ? eq(logs.area, filters.area) : undefined,
    filters.action ? eq(logs.action, filters.action) : undefined,
    filters.outcome ? eq(logs.outcome, filters.outcome as AuditEntry["outcome"]) : ne(logs.outcome, "access"),
    filters.role ? eq(logs.actorRole, filters.role as NonNullable<AuditEntry["actorRole"]>) : undefined,
    ...filters.q.split(/\s+/).filter(Boolean).slice(0, 12).map(word => ilike(logs.searchText, `%${word.replace(/[\\%_]/g, "\\$&")}%`)),
  );
}
function auditOrder(filters: AuditFilters) {
  switch (filters.sort) {
    case "oldest": return [asc(logs.startedAt), asc(logs.id)];
    case "actor": return [asc(logs.actorName), desc(logs.startedAt), asc(logs.id)];
    case "action": return [asc(logs.actionLabel), desc(logs.startedAt), asc(logs.id)];
    case "entity": return [asc(logs.entityLabel), desc(logs.startedAt), asc(logs.id)];
    case "outcome": return [asc(logs.outcome), desc(logs.startedAt), asc(logs.id)];
    case "duration": return [sql`${logs.durationMs} desc nulls last`, desc(logs.startedAt), asc(logs.id)];
    default: return [desc(logs.startedAt), asc(logs.id)];
  }
}
export function auditRow(row: typeof logs.$inferSelect): AuditEntry {
  return { ...row, area: row.area as AuditEntry["area"], details: row.details as AuditEntry["details"], startedAt: row.startedAt.toISOString(), occurredAt: row.occurredAt.toISOString() };
}

export async function readAudit(filters: AuditFilters, exportLimit?: number): Promise<AuditView> {
  await flushAuditBuffer(true);
  const buffered = await auditBufferedCount();
  const db = getDb();
  const where = auditWhere(filters, auditContext.getStore()?.id);
  let ready = false;
  try { ready = (await db.execute<{ ready: boolean }>(sql`select to_regclass('public.studio_audit_logs') is not null as ready`))[0]?.ready === true; }
  catch { throw new Error("audit_database_unavailable"); }
  if (!ready) return { ready: false, buffered, rows: [], total: 0, page: 1, pages: 1, filters, actors: [], actions: [] };
  // One repeatable snapshot keeps the count and page coherent under concurrent requests.
  return db.transaction(async tx => {
    const total = (await tx.select({ total: sql<number>`count(*)::int` }).from(logs).where(where))[0]?.total ?? 0;
    if (exportLimit && total > exportLimit) throw new Error("audit_export_limit");
    if (exportLimit) {
      const bytes = (await tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${logs.details}::text)), 0)::bigint` }).from(logs).where(where))[0]?.bytes ?? 0;
      if (Number(bytes) > 32 * 1024 * 1024) throw new Error("audit_export_limit");
    }
    const pages = Math.max(1, Math.ceil(total / filters.size));
    const page = Math.min(filters.page, pages);
    const rows = await tx.select().from(logs).where(where).orderBy(...auditOrder(filters)).limit(exportLimit || filters.size).offset(exportLimit ? 0 : (page - 1) * filters.size);
    const actors = await tx.selectDistinctOn([logs.actorId], { id: logs.actorId, name: logs.actorName, email: logs.actorEmail }).from(logs).where(sql`${logs.actorId} is not null`).orderBy(asc(logs.actorId), desc(logs.startedAt));
    const actions = await tx.selectDistinct({ value: logs.action, label: logs.actionLabel }).from(logs).orderBy(asc(logs.actionLabel));
    return { ready: true, buffered, rows: rows.map(auditRow), total, page, pages, filters: { ...filters, page }, actors: actors.map(row => ({ ...row, id: row.id! })).sort((a, b) => a.name.localeCompare(b.name, "bg")), actions };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export function auditCsv(rows: AuditEntry[]) {
  const cell = (value: unknown) => { const text = String(value ?? ""); return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`; };
  const lines: unknown[][] = [["Час UTC", "Час София", "Служител", "Email", "Роля", "Раздел", "Действие", "Обект", "ID обект", "Резултат", "HTTP", "ms", "IP", "Запис ID", "Детайли"]];
  for (const row of rows) lines.push([row.startedAt, new Date(row.startedAt).toLocaleString("bg-BG", { timeZone: "Europe/Sofia", hour12: false }), row.actorName, row.actorEmail, row.actorRole, AUDIT_AREAS[row.area], row.actionLabel, row.entityLabel, row.entityId, row.outcome, row.statusCode, row.durationMs, row.ip, row.id, JSON.stringify(row.details)]);
  return "\uFEFF" + lines.map(line => line.map(cell).join(",")).join("\r\n");
}
