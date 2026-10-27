import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROBE_NAMES, safeCycle, advanceMonitor, safeState, monitoringView, safeIssue, type Cycle } from "../packages/content/src/error-monitoring";
import { saveMonitorState, publishExternal } from "../scripts/diagnostics/state.mjs";
import { needsMonitoringAttention } from "../apps/studio/lib/error-monitoring-client";

// Explicit fixtures, never used as live data in the Studio screen.
const now = Date.parse("2026-10-27T10:00:00.000Z");
function cycle(at = now, profile: "origin" | "external" = "origin", outcome = "ok"): Cycle {
  const stamp = new Date(at).toISOString();
  return safeCycle({ profile, startedAt: stamp, finishedAt: stamp, probes: PROBE_NAMES.filter(n => profile === "origin" || n.startsWith("public-")).map(name => ({ name, probeId: randomUUID(), transport: name.endsWith("-h2") ? "h2" : "http1", scope: name.includes("home") || name.endsWith("sse") ? "first-byte" : "body", status: outcome === "http-error" ? 524 : outcome === "timeout" ? null : 200, outcome, durationMs: outcome === "timeout" ? 8000 : 100, headersMs: 90, firstByteMs: 95, bytes: 10 })),
    apache: { available: true, BusyWorkers: 4, IdleWorkers: 96, Cookie: "SECRET" }, apps: profile === "origin" ? ["web", "studio"].map(service => ({ service, at: stamp, active: 1, sse: 0, rssBytes: 100, eventLoopMaxMs: 1, skipped: 0, dropped: 0, ioFailures: 0 })) : [], requestIssues: [] })!;
}
describe("observed monitoring history", () => {
  it("groups repeated failures, preserves evidence on recovery and ignores duplicate or out-of-order cycles", () => {
    let state = advanceMonitor(null, cycle(now, "origin", "http-error"));
    state = advanceMonitor(state, cycle(now + 60000, "origin", "http-error"));
    expect(state.incidents).toHaveLength(1); expect(state.incidents[0]?.checks).toBe(2);
    const unchanged = advanceMonitor(state, cycle(now, "origin", "timeout")); expect(unchanged).toBe(state);
    state = advanceMonitor(state, cycle(now + 120000));
    expect(state.incidents[0]?.endedAt).toBe(new Date(now + 120000).toISOString());
    expect(state.incidents[0]?.evidence.probes[0]?.status).toBe(524);
    expect(safeState(state)).toEqual(state);
  });
  it("does not declare an outage or recovery during gaps in observation", () => {
    const before = advanceMonitor(null, cycle(now, "origin", "timeout"));
    const after = advanceMonitor(before, cycle(now + 600000, "origin", "timeout"));
    expect(after.incidents.some(i => i.kind === "observation-gap" && i.checks === 0)).toBe(true);
    expect(after.incidents.find(i => i.kind === "failure")?.endedAt).toBeNull();
    const recovered = advanceMonitor(after, cycle(now + 660000));
    expect(recovered.incidents.find(i => i.kind === "failure")?.endedAt).toBe(new Date(now + 660000).toISOString());
  });
  it("requires fresh external/local data and recorder heartbeats; missing/future/stale is never green", () => {
    const origin = advanceMonitor(null, cycle()), external = advanceMonitor(null, cycle(now, "external"));
    expect(monitoringView(origin, external, now).status).toBe("ok");
    expect(monitoringView(origin, null, now).status).toBe("unknown");
    expect(monitoringView(origin, external, now + 151000).status).toBe("unknown");
    expect(monitoringView(origin, external, now - 31000).status).toBe("unknown");
    origin.latest.apps[0].skipped = 1;
    expect(monitoringView(origin, external, now).status).toBe("problem");
    origin.latest.apps = [];
    expect(monitoringView(origin, external, now).status).toBe("unknown");
  });
  it("keeps access limitations distinct from downtime and retains the strongest incident evidence", () => {
    let state = advanceMonitor(null, cycle(now, "origin", "http-error"));
    state = advanceMonitor(state, cycle(now + 60000, "origin", "cloudflare-challenge"));
    expect(state.incidents[0]?.kind).toBe("failure");
    expect(state.incidents[0]?.evidence.probes[0]?.status).toBe(524);
    const limited = advanceMonitor(null, cycle(now, "external", "cloudflare-challenge"));
    expect(limited.incidents[0]?.kind).toBe("access-limited");
  });
  it("whitelists sensitive input, requires all probes, excludes ordinary SSE/probe cancellations and bounds history", () => {
    const c = cycle(); const raw = { ...c, url: "/secret?token=SECRET", headers: { authorization: "SECRET" }, apache: { ...c.apache, Client: "SECRET" } };
    expect(JSON.stringify(safeCycle(raw))).not.toContain("SECRET");
    expect(safeCycle({ ...c, probes: c.probes.slice(1) })).toBeNull();
    expect(safeCycle({ ...c, probes: c.probes.map(p => ({ ...p, outcome: "unknown-SECRET" })) })).toBeNull();
    const issue = { at: c.finishedAt, id: randomUUID(), service: "web", event: "aborted", route: "public-page", method: "GET", durationMs: 4000, status: null, headersSent: false };
    expect(safeIssue({ ...issue, route: "live-sse" })).toBeNull();
    expect(safeIssue({ ...issue, probeId: randomUUID() })).toBeNull();
    expect(safeIssue(safeIssue(issue))).not.toBeNull();
    let state = advanceMonitor(null, cycle());
    for (let i = 1; i <= 230; i++) state = advanceMonitor(state, cycle(now + i * 60000, "origin", i % 2 ? "timeout" : "ok"));
    expect(state.incidents).toHaveLength(100);
  });
  it("persists and reopens real fixture incidents atomically and backfills retained journals without double counting", async () => {
    const dir = await mkdtemp(join(tmpdir(), "np-monitor-state-"));
    try {
      await expect(saveMonitorState(dir, { profile: "../invalid" })).rejects.toThrow("Invalid diagnostics profile");
      const failed = cycle(now, "external", "timeout");
      await writeFile(join(dir, "external.0.jsonl"), JSON.stringify(failed) + "\n");
      const first = await saveMonitorState(dir, failed);
      expect(first.incidents[0].checks).toBe(1);
      await saveMonitorState(dir, cycle(now + 60000, "external"));
      const saved = safeState(JSON.parse(await readFile(join(dir, "monitor-external.json"), "utf8")));
      expect(saved?.incidents[0]?.endedAt).toBe(new Date(now + 60000).toISOString());
      await expect(publishExternal(saved, { target: "np2@other.example", key: "/key" })).rejects.toThrow("configuration invalid");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("keeps the menu warning until explicit acknowledgement and never hides an active/unknown/connection problem", () => {
    const summary = { status: "ok" as const, checkedAt: new Date(now).toISOString(), attentionAt: new Date(now - 1000).toISOString(), activeProblem: false };
    expect(needsMonitoringAttention(summary, null, false)).toBe(true);
    expect(needsMonitoringAttention(summary, summary.attentionAt, false)).toBe(false);
    expect(needsMonitoringAttention({ ...summary, activeProblem: true }, summary.attentionAt, false)).toBe(true);
    expect(needsMonitoringAttention({ ...summary, status: "unknown" }, summary.attentionAt, false)).toBe(true);
    expect(needsMonitoringAttention(summary, summary.attentionAt, true)).toBe(true);
  });
});

const deps = vi.hoisted(() => ({ staff: vi.fn(), read: vi.fn() }));
vi.mock("../apps/studio/lib/session", () => ({ staffFromRequest: deps.staff }));
vi.mock("../apps/studio/lib/error-monitoring", () => ({ readErrorMonitoring: deps.read }));
import { GET } from "../apps/studio/app/api/error-monitoring/route";
describe("private monitoring API authorization", () => {
  it("denies anonymous/editor access before any filesystem/SSH read", async () => {
    deps.read.mockClear(); deps.staff.mockResolvedValue(null);
    expect((await GET(new Request("https://example.test/admin/api/error-monitoring/"))).status).toBe(401);
    deps.staff.mockResolvedValue({ role: "editor" });
    expect((await GET(new Request("https://example.test/admin/api/error-monitoring/"))).status).toBe(403);
    expect(deps.read).not.toHaveBeenCalled();
  });
  it("returns private no-store details and a smaller menu response for administrators", async () => {
    deps.staff.mockResolvedValue({ role: "admin" }); deps.read.mockResolvedValue(monitoringView(null, null, now));
    const response = await GET(new Request("https://example.test/admin/api/error-monitoring/?view=summary"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    const body = await response.json(); expect(body.status).toBe("unknown"); expect(body.sources).toBeUndefined();
    deps.staff.mockResolvedValue({ role: "master_admin" });
    expect((await (await GET(new Request("https://example.test/admin/api/error-monitoring/"))).json()).sources).toEqual({ origin: null, external: null });
    deps.read.mockRejectedValue(new Error("SECRET"));
    const failed = await GET(new Request("https://example.test/admin/api/error-monitoring/")); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("SECRET");
  });
});
