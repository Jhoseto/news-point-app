import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { readFile, mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@newspoint/db/schema";
import { auditFixture } from "../../../tests/studio/audit-fixtures";
const context = vi.hoisted(() => ({ db: undefined as unknown, unavailable: false }));
vi.mock("@newspoint/db", async importOriginal => ({ ...await importOriginal<typeof import("@newspoint/db")>(), getDb: () => { if (context.unavailable) throw new Error("QA database offline"); return context.db; } }));
import { auditCsv, auditDateRange, auditFilters, readAudit } from "./audit-query";
import { auditBufferDirectory, auditBufferedCount, flushAuditBuffer, insertAuditEntry, persistAudit } from "./audit-store";
import { canReadLogs } from "./editor/roles";

let pg: PGlite; let directory: string;
const filters = (query = "") => auditFilters(new URLSearchParams(`period=all&${query}`), new Date("2026-10-12T18:00:00Z"));
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "np-audit-qa-")); vi.stubEnv("STUDIO_AUDIT_BUFFER_DIR", directory); vi.stubEnv("MEDIA_ROOT", "");
  pg = new PGlite({ extensions: { pg_trgm } });
  const migration = await readFile(resolve("packages/db/migrations/31_studio_audit_logs.sql"), "utf8");
  await pg.exec(migration); await pg.exec(migration); // The numbered migration is safely rerunnable.
  const db = drizzle(pg, { schema });
  const originalExecute = db.execute.bind(db);
  // Production uses postgres.js RowList; PGlite's execute envelope contains .rows.
  Object.assign(db, { execute: async (query: Parameters<typeof originalExecute>[0]) => (await originalExecute(query)).rows });
  context.db = db;
  for (let index = 1; index <= 65; index++) await insertAuditEntry(auditFixture({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, startedAt: `2026-10-12T09:${String(index % 60).padStart(2, "0")}:00Z`, actorId: index % 2 ? "qa-editor" : "qa-admin", actorName: index % 2 ? "QA редактор" : "QA администратор", actorRole: index % 2 ? "editor" : "admin", area: index % 2 ? "articles" : "arrangements", action: index % 2 ? "articles.revision" : "arrangements.place", actionLabel: index % 2 ? "Запазване на редакция" : "Поставяне на позиция", outcome: index === 2 ? "failure" : "success" }));
}, 30_000);
afterAll(async () => { await pg?.close(); vi.unstubAllEnvs(); if (directory?.startsWith(join(tmpdir(), "np-audit-qa-"))) await rm(directory, { recursive: true, force: true }); });

describe("Real isolated PostgreSQL journal", () => {
  it("filters by employee, historical role, area, action and actual outcome", async () => {
    const result = await readAudit(filters("actor=qa-admin&role=admin&area=arrangements&action=arrangements.place&outcome=failure"));
    expect(result.ready).toBe(true); expect(result.total).toBe(1); expect(result.rows[0]).toMatchObject({ actorId: "qa-admin", outcome: "failure", actorRole: "admin" });
    expect(result.actors).toHaveLength(2); expect(result.actions).toHaveLength(2);
  });
  it("searches multiple words with literal %, _ and backslash escaping", async () => {
    expect((await readAudit(filters("q=QA%20100%25%2050_%D1%82%D0%BE%D1%87%D0%BA%D0%B8"))).total).toBe(65);
    expect((await readAudit(filters("q=nonexistent%25"))).total).toBe(0);
    expect((await readAudit(filters("q=%27%20OR%201%3D1"))).total).toBe(0);
  });
  it("paginates and sorts deterministically while excluding newer arrivals", async () => {
    const first = await readAudit(filters("size=25&sort=oldest"));
    const second = await readAudit(filters("size=25&sort=oldest&page=2"));
    expect(first.rows).toHaveLength(25); expect(first.total).toBe(65); expect(first.pages).toBe(3);
    expect(first.rows.some(row => second.rows.some(other => other.id === row.id))).toBe(false);
    await insertAuditEntry(auditFixture({ id: "33333333-3333-4333-8333-333333333333", startedAt: "2026-10-13T09:00:00Z" }));
    expect((await readAudit(filters("sort=newest"))).total).toBe(65);
    expect((await readAudit(filters("page=9999"))).page).toBe(2);
  });
  it("protects completed history against updates and deletes, while allowing one finalization", async () => {
    const entry = auditFixture({ id: "44444444-4444-4444-8444-444444444444", outcome: "pending", statusCode: null });
    await insertAuditEntry(entry); await insertAuditEntry({ ...entry, outcome: "success", statusCode: 200 });
    await insertAuditEntry({ ...entry, outcome: "failure", statusCode: 500 }); await insertAuditEntry(entry);
    expect((await pg.query<{ outcome: string }>("select outcome from studio_audit_logs where id=$1", [entry.id])).rows[0]?.outcome).toBe("success");
    await expect(pg.query("update studio_audit_logs set actor_name='fake' where id=$1", [entry.id])).rejects.toThrow(/cannot|finalized/);
    await expect(pg.query("delete from studio_audit_logs where id=$1", [entry.id])).rejects.toThrow(/deleted/);
  });
  it("keeps concurrent offline attempts and completions, and replays them without duplicates", async () => {
    context.unavailable = true;
    const entries = [5, 6, 7].map(value => auditFixture({ id: `55555555-5555-4555-8555-${String(value).padStart(12, "0")}` }));
    expect(await Promise.all(entries.flatMap(entry => [persistAudit({ ...entry, outcome: "pending" }), persistAudit(entry)]))).toEqual([true, true, true, true, true, true]);
    expect(await auditBufferedCount()).toBe(6); expect((await readdir(directory)).every(name => !name.endsWith(".tmp"))).toBe(true);
    context.unavailable = false; await flushAuditBuffer(true); expect(await auditBufferedCount()).toBe(0);
    const result = await pg.query<{ outcome: string }>("select outcome from studio_audit_logs where id::text like '55555555%' ");
    expect(result.rows).toHaveLength(3); expect(result.rows.every(row => row.outcome === "success")).toBe(true);
    await flushAuditBuffer(true); expect(await auditBufferedCount()).toBe(0);
  });
  it("refuses to put the private recovery buffer under publicly served media", () => {
    vi.stubEnv("MEDIA_ROOT", directory); expect(auditBufferDirectory).toThrow(/outside public media/); vi.stubEnv("MEDIA_ROOT", "");
  });
  it("fails durable recording honestly when the only buffer path is a file", async () => {
    const file = join(directory, "unwritable"); await writeFile(file, "QA");
    vi.stubEnv("STUDIO_AUDIT_BUFFER_DIR", file); context.unavailable = true;
    expect(await persistAudit(auditFixture())).toBe(false);
    context.unavailable = false; vi.stubEnv("STUDIO_AUDIT_BUFFER_DIR", directory);
  });
});
describe("Audit query boundaries", () => {
  it("uses Sofia wall midnight across the 23-hour spring and 25-hour autumn days", () => {
    for (const [date, hours] of [["2026-03-29", 23], ["2026-10-25", 25]] as const) {
      const range = auditDateRange({ ...filters(), period: "custom", from: date, to: date });
      expect((range.to!.getTime() - range.from!.getTime()) / 3_600_000).toBe(hours);
    }
    expect(auditDateRange({ ...filters(), period: "custom", from: "2026-02-31", to: "invalid" })).toEqual({ from: null, to: null });
  });
  it("clamps filters and prevents spreadsheet formulas from executing", () => {
    const parsed = filters("size=100000&sort=SQL&outcome=bad&anchor=2100-01-01&page=-1");
    expect(parsed).toMatchObject({ size: 50, sort: "newest", outcome: "", page: 1, anchor: "2026-10-12T18:00:00.000Z" });
    expect(auditCsv([auditFixture({ actorName: "=HYPERLINK(x)", entityLabel: 'quoted "title"' })])).toContain('"\'=HYPERLINK(x)"');
    expect(auditCsv([auditFixture({ entityLabel: 'quoted "title"' })])).toContain('quoted ""title""');
  });
  it("permits logs only to administrators and masteradmin", () => {
    expect(canReadLogs("editor")).toBe(false); expect(canReadLogs("admin")).toBe(true); expect(canReadLogs("master_admin")).toBe(true);
  });
});
