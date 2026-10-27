/** Public types/pure logic only. Never include raw request URLs, headers or bodies. */
export const MONITOR_STALE_MS = 150_000;
export const PROBE_NAMES = ["web-home", "web-static", "web-login-rewrite", "studio-login", "public-home", "public-login", "public-static", "public-sse", "public-home-h2", "public-static-h2"] as const;
export const OUTCOMES = ["ok", "timeout", "http-error", "cloudflare-challenge", "denied", "unexpected-content-type", "body-limit", "empty-body", "truncated", "connection-error", "tls-error", "tls-or-h2-connection-error"] as const;
export type Probe = { name: string; probeId: string; transport: "http1" | "h2"; scope: "body" | "first-byte"; outcome: string; status: number | null; headersMs: number | null; firstByteMs: number | null; durationMs: number; bytes: number; cfRay?: string };
export type AppEvidence = { service: "web" | "studio"; at: string | null; active: number | null; sse: number | null; rssBytes: number | null; eventLoopMaxMs: number | null; skipped: number | null; dropped: number | null; ioFailures: number | null };
export type RequestIssue = { at: string; service: "web" | "studio"; id: string; event: "slow" | "finish" | "aborted"; route: string; method: string; durationMs: number; status: number | null; cfRay?: string; probeId?: string; headersSent?: boolean };
export type Cycle = { startedAt: string; finishedAt: string; profile: "origin" | "external"; probes: Probe[]; apache: Record<string, number> | null; observerHost: { uptimeSeconds: number | null; load: number[]; freeBytes: number | null; totalBytes: number | null } | null; apps: AppEvidence[]; requestIssues: RequestIssue[] };
export type Incident = { id: string; kind: "failure" | "slow" | "access-limited" | "observation-gap"; startedAt: string; lastSeenAt: string; endedAt: string | null; checks: number; evidence: Cycle };
export type MonitorState = { version: 1; profile: "origin" | "external"; firstObservedAt: string; checkedAt: string; latest: Cycle; incidents: Incident[]; requestIssues: RequestIssue[] };
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const iso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v) && Number.isFinite(Date.parse(v));
const number = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER ? v : null;
const id = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9-]{36}$/.test(v);
const ray = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{16}(?:-[A-Z]{3})?$/i.test(v);
const APACHE_KEYS = ["BusyWorkers", "IdleWorkers", "GracefulWorkers", "Processes", "Stopping", "ConnsTotal", "ConnsAsyncWaitIO", "ConnsAsyncWriting", "ConnsAsyncKeepAlive", "ConnsAsyncClosing", "Load1", "Load5", "Load15", "ServerUptimeSeconds", "ParentServerConfigGeneration", "ParentServerMPMGeneration"];

export function safeIssue(value: unknown): RequestIssue | null {
  const v = object(value);
  if (!iso(v.at) || !id(v.id) || !["web", "studio"].includes(String(v.service)) || !["slow", "finish", "aborted"].includes(String(v.event))
    || !["public-page", "homepage", "studio-page", "studio-api", "live-sse", "web-api", "asset", "service-worker"].includes(String(v.route))
    || !/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|OTHER)$/.test(String(v.method)) || number(v.durationMs) === null) return null;
  const status = number(v.status);
  if (!(v.event === "slow" || status !== null && status >= 500 || v.event === "aborted" && v.headersSent === false && Number(v.durationMs) >= 3000 && v.route !== "live-sse")) return null;
  if (v.probeId) return null; // Planned first-byte cancellations belong to probe results.
  return { at: v.at, id: v.id, service: v.service as RequestIssue["service"], event: v.event as RequestIssue["event"], route: String(v.route), method: String(v.method), durationMs: Number(v.durationMs), status,
    ...(ray(v.cfRay) ? { cfRay: v.cfRay } : {}), ...(v.event === "aborted" ? { headersSent: false } : {}) };
}

export function safeApp(value: unknown, service: "web" | "studio"): AppEvidence {
  const v = object(value);
  return { service, at: iso(v.at) ? v.at : null, active: number(v.active), sse: number(v.sse), rssBytes: number(v.rssBytes), eventLoopMaxMs: number(v.eventLoopMaxMs), skipped: number(v.skipped), dropped: number(v.dropped), ioFailures: number(v.ioFailures) };
}

export function safeCycle(value: unknown): Cycle | null {
  const v = object(value);
  if (!iso(v.startedAt) || !iso(v.finishedAt) || Date.parse(v.finishedAt) < Date.parse(v.startedAt) || !["origin", "external"].includes(String(v.profile)) || !Array.isArray(v.probes) || !v.probes.length || v.probes.length > 10) return null;
  const probes: Probe[] = [];
  for (const raw of v.probes) {
    const p = object(raw);
    if (!PROBE_NAMES.includes(p.name as typeof PROBE_NAMES[number]) || !id(p.probeId) || !OUTCOMES.includes(p.outcome as typeof OUTCOMES[number]) || number(p.durationMs) === null || number(p.bytes) === null
      || !["http1", "h2"].includes(String(p.transport)) || !["body", "first-byte"].includes(String(p.scope)) || p.status !== null && (number(p.status) === null || Number(p.status) < 100 || Number(p.status) > 599)) return null;
    probes.push({ name: String(p.name), probeId: p.probeId, transport: p.transport as Probe["transport"], scope: p.scope as Probe["scope"], outcome: String(p.outcome), status: number(p.status), durationMs: Number(p.durationMs), bytes: Number(p.bytes), headersMs: number(p.headersMs), firstByteMs: number(p.firstByteMs), ...(ray(p.cfRay) ? { cfRay: p.cfRay } : {}) });
  }
  if (new Set(probes.map(p => p.name)).size !== probes.length) return null;
  const required = v.profile === "origin" ? PROBE_NAMES : PROBE_NAMES.filter(n => n.startsWith("public-"));
  if (!required.every(name => probes.some(p => p.name === name))) return null;
  const a = object(v.apache);
  const apache = a.available === false ? null : Object.fromEntries(APACHE_KEYS.flatMap(key => number(a[key]) !== null ? [[key, Number(a[key])]] : []));
  const host = object(v.observerHost);
  const observerHost = Object.keys(host).length ? { uptimeSeconds: number(host.uptimeSeconds), load: Array.isArray(host.load) ? host.load.slice(0, 3).filter((n): n is number => number(n) !== null) : [], freeBytes: number(host.freeBytes), totalBytes: number(host.totalBytes) } : null;
  const apps = Array.isArray(v.apps) ? v.apps.slice(0, 2).map(a => safeApp(a, object(a).service === "studio" ? "studio" : "web")) : [];
  const requestIssues = Array.isArray(v.requestIssues) ? v.requestIssues.slice(-50).map(safeIssue).filter((r): r is RequestIssue => r !== null) : [];
  return { startedAt: v.startedAt, finishedAt: v.finishedAt, profile: v.profile as Cycle["profile"], probes, apache: apache && Object.keys(apache).length ? apache : null, observerHost, apps, requestIssues };
}

export function cycleKind(cycle: Cycle): Incident["kind"] | null {
  if (cycle.probes.some(p => !["ok", "denied", "cloudflare-challenge"].includes(p.outcome))) return "failure";
  if (cycle.probes.some(p => p.durationMs >= 3000)) return "slow";
  if (cycle.probes.some(p => p.outcome !== "ok")) return "access-limited";
  return null;
}

/** One incident per contiguous observed problem; recovery is observed, not exact downtime. */
export function advanceMonitor(previous: MonitorState | null, cycle: Cycle): MonitorState {
  if (previous && (previous.profile !== cycle.profile || Date.parse(cycle.finishedAt) <= Date.parse(previous.checkedAt))) return previous;
  const incidents = previous ? previous.incidents.map(i => ({ ...i })) : [];
  const evidence = { ...cycle, requestIssues: cycle.requestIssues.slice(-5) };
  const priorTime = previous ? Date.parse(previous.checkedAt) : 0;
  if (previous && Date.parse(cycle.startedAt) - priorTime > MONITOR_STALE_MS) {
    incidents.push({ id: `${cycle.profile}:${previous.checkedAt}:gap`, kind: "observation-gap", startedAt: previous.checkedAt, lastSeenAt: cycle.startedAt, endedAt: cycle.startedAt, checks: 0, evidence });
  }
  const kind = cycleKind(cycle);
  const open = incidents.find(i => i.endedAt === null);
  if (kind) {
    if (open) { open.lastSeenAt = cycle.finishedAt; open.checks++; if (kind === "failure" || open.kind !== "failure") { open.kind = kind; open.evidence = evidence; } }
    else incidents.push({ id: `${cycle.profile}:${cycle.startedAt}`, kind, startedAt: cycle.startedAt, lastSeenAt: cycle.finishedAt, endedAt: null, checks: 1, evidence });
  } else if (open) open.endedAt = cycle.finishedAt;
  const issues = new Map((previous?.requestIssues ?? []).map(i => [i.id + i.event, i]));
  for (const issue of cycle.requestIssues) issues.set(issue.id + issue.event, issue);
  return { version: 1, profile: cycle.profile, firstObservedAt: previous?.firstObservedAt ?? cycle.startedAt, checkedAt: cycle.finishedAt, latest: cycle,
    incidents: incidents.slice(-100), requestIssues: [...issues.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-100) };
}

export function safeState(value: unknown): MonitorState | null {
  const v = object(value), latest = safeCycle(v.latest);
  if (v.version !== 1 || !latest || v.profile !== latest.profile || v.checkedAt !== latest.finishedAt || !iso(v.firstObservedAt) || !Array.isArray(v.incidents) || v.incidents.length > 100) return null;
  const incidents: Incident[] = [];
  for (const raw of v.incidents) {
    const i = object(raw), evidence = safeCycle(i.evidence);
    if (!evidence || evidence.profile !== latest.profile || typeof i.id !== "string" || !/^(origin|external):[0-9TZ:.\-]+(?::gap)?$/.test(i.id) || !["failure", "slow", "access-limited", "observation-gap"].includes(String(i.kind))
      || !iso(i.startedAt) || !iso(i.lastSeenAt) || i.endedAt !== null && !iso(i.endedAt) || number(i.checks) === null) return null;
    incidents.push({ id: i.id, kind: i.kind as Incident["kind"], startedAt: i.startedAt, lastSeenAt: i.lastSeenAt, endedAt: i.endedAt as string | null, checks: Number(i.checks), evidence });
  }
  return { version: 1, profile: latest.profile, checkedAt: latest.finishedAt, firstObservedAt: v.firstObservedAt, latest, incidents,
    requestIssues: Array.isArray(v.requestIssues) ? v.requestIssues.slice(-100).map(safeIssue).filter((r): r is RequestIssue => r !== null) : [] };
}

export type MonitoringView = { checkedAt: string; sources: { origin: MonitorState | null; external: MonitorState | null }; status: "ok" | "problem" | "unknown"; attentionAt: string | null; activeProblem: boolean };
export function monitoringView(origin: MonitorState | null, external: MonitorState | null, now = Date.now()): MonitoringView {
  const fresh = (s: MonitorState | null) => s !== null && now - Date.parse(s.checkedAt) >= -30_000 && now - Date.parse(s.checkedAt) <= MONITOR_STALE_MS;
  const recordersFresh = !!origin && (["web", "studio"] as const).every(service => origin.latest.apps.some(a => a.service === service && a.at && now - Date.parse(a.at) >= -30000 && now - Date.parse(a.at) <= MONITOR_STALE_MS));
  const activeProblem = [origin, external].some(s => fresh(s) && s && (cycleKind(s.latest) !== null || s.latest.apps.some(a => (a.ioFailures ?? 0) > 0 || (a.dropped ?? 0) > 0 || (a.skipped ?? 0) > 0)));
  const events = [origin, external].flatMap(s => s ? [...s.incidents.map(i => i.endedAt ?? i.lastSeenAt), ...s.requestIssues.map(i => i.at)] : []).sort();
  return { checkedAt: new Date(now).toISOString(), sources: { origin, external }, status: activeProblem ? "problem" : fresh(origin) && fresh(external) && recordersFresh ? "ok" : "unknown", attentionAt: events.at(-1) ?? null, activeProblem };
}
