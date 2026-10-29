import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
const context = vi.hoisted(() => ({ staff: vi.fn(), read: vi.fn() }));
vi.mock("./session", () => ({ staffFromRequest: context.staff }));
vi.mock("./audit-query", () => ({ auditFilters: () => ({}), readAudit: context.read, auditCsv: () => "QA CSV" }));
import { GET } from "../app/api/logs/route";
const root = resolve("apps/studio/app/api");
describe("All Studio entry points are covered", () => {
  it("keeps every exported HTTP method behind server audit", () => {
    const routes = readdirSync(root, { recursive: true }).filter(file => String(file).endsWith("route.ts"));
    expect(routes.length).toBeGreaterThan(20);
    for (const file of routes) {
      const code = readFileSync(resolve(root, String(file)), "utf8");
      expect(code, String(file)).not.toMatch(/export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/);
      const exports = [...code.matchAll(/export const (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*=\s*([^;]+)/g)];
      expect(exports.length, String(file)).toBeGreaterThan(0);
      for (const [, , expression] of exports) expect(expression, String(file)).toMatch(/^withStaffAudit\(handle/);
    }
  });
  it("protects the page as well as the API and hides the button from editors", () => {
    const page = readFileSync(resolve("apps/studio/app/(studio)/logs/page.tsx"), "utf8");
    expect(page).toContain("if (!canReadLogs(staff.role)) notFound()");
    const shell = readFileSync(resolve("apps/studio/components/studio-shell.tsx"), "utf8");
    expect(shell).toContain("canManageUsers ? [...NAV, USERS_LINK, LOGS_LINK, AI_SETTINGS_LINK] : NAV");
    expect(shell).toContain("href={LOGS_LINK.href}");
  });
});
describe("Logs server permissions", () => {
  beforeEach(() => { vi.clearAllMocks(); context.read.mockResolvedValue({ ready: true, rows: [] }); });
  it.each([[null, 401], [{ id: "qa", role: "editor" }, 403]] as const)("denies unauthorized readers before querying history", async (staff, status) => {
    context.staff.mockResolvedValue(staff);
    const result = await GET(new Request("http://studio.test/admin/api/logs/?export=csv"));
    expect(result.status).toBe(status); expect(context.read).not.toHaveBeenCalled(); expect(result.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each(["admin", "master_admin"])("allows %s to read and export", async role => {
    context.staff.mockResolvedValue({ id: "qa", role });
    expect((await GET(new Request("http://studio.test/admin/api/logs/"))).status).toBe(200);
    const exported = await GET(new Request("http://studio.test/admin/api/logs/?export=csv"));
    expect(exported.status).toBe(200); expect(await exported.text()).toBe("QA CSV"); expect(exported.headers.get("cache-control")).toBe("private, no-store");
  });
  it("returns a readable error rather than silently truncating an oversized export", async () => {
    context.staff.mockResolvedValue({ id: "qa", role: "admin" }); context.read.mockRejectedValue(new Error("audit_export_limit"));
    expect((await GET(new Request("http://studio.test/admin/api/logs/?export=csv"))).status).toBe(422);
  });
});
