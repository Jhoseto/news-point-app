import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { randomUUID } from "node:crypto";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { createJournal } from "./journal.mjs";

// No raw URL, query, referrer, error text, cookie, IP, user-agent or request body.
export function requestLabels(request) {
  const path = (request.url ?? "").split("?", 1)[0];
  let route = "public-page";
  if (/^\/admin(?:\/|$)/.test(path)) route = path.startsWith("/admin/api/") ? "studio-api" : "studio-page";
  else if (path === "/api/live/") route = "live-sse";
  else if (path.startsWith("/api/")) route = "web-api";
  else if (/^\/(?:_next|brand|fonts|media|wp-content)\//.test(path)) route = "asset";
  else if (path === "/sw.js") route = "service-worker";
  else if (path === "/") route = "homepage";
  const scalar = value => typeof value === "string" ? value : "";
  const ray = scalar(request.headers["cf-ray"]);
  const probe = scalar(request.headers["x-np-diagnostic-id"]);
  return {
    method: /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(request.method) ? request.method : "OTHER",
    route,
    // Caller-supplied correlation hints, never authentication or trusted identity.
    ...( /^[a-f0-9]{16}(?:-[A-Z]{3})?$/i.test(ray) ? { cfRay: ray } : {}),
    ...( /^[a-f0-9-]{36}$/.test(probe) ? { probeId: probe } : {}),
  };
}

export function observeHttp({ service, journal, slowMs = 3000, sweepMs = 10000, maxActive = 2000 }) {
  if (!["web", "studio"].includes(service)) throw new Error("Unknown diagnostics service");
  const active = new Map();
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  let skipped = 0;
  const write = data => { try { journal.write({ at: new Date().toISOString(), service, pid: process.pid, ...data }); } catch { skipped++; } };
  function onRequest({ request, response }) {
    // A diagnostics subscriber must never throw: Node treats that as uncaught.
    try {
      if (active.has(response)) return;
      if (active.size >= maxActive) { skipped++; return; }
      const labels = requestLabels(request);
      const state = { id: randomUUID(), started: performance.now(), ...labels, response, slow: false };
      const end = reason => {
        if (!active.delete(response)) return;
        response.removeListener("finish", finished);
        response.removeListener("close", closed);
        write({ event: reason, id: state.id, ...labels,
          durationMs: Math.round(performance.now() - state.started),
          headersSent: response.headersSent,
          status: response.headersSent ? response.statusCode : null });
      };
      const finished = () => end("finish");
      const closed = () => end(response.writableFinished ? "finish" : "aborted");
      state.detach = () => { response.removeListener("finish", finished); response.removeListener("close", closed); };
      active.set(response, state);
      response.once("finish", finished);
      response.once("close", closed);
      write({ event: "start", id: state.id, ...labels });
    } catch { skipped++; }
  }
  subscribe("http.server.request.start", onRequest);
  const timer = setInterval(() => {
    try {
      const now = performance.now();
      for (const state of active.values()) {
        // A healthy SSE stream is expected to remain open; it is counted below.
        if (!state.slow && state.route !== "live-sse" && now - state.started >= slowMs) {
          state.slow = true;
          const { response, detach, started, slow, ...labels } = state;
          write({ event: "slow", ...labels, durationMs: Math.round(now - started), headersSent: response.headersSent });
        }
      }
      write({ event: "process", active: active.size,
        sse: [...active.values()].filter(s => s.route === "live-sse").length,
        rssBytes: process.memoryUsage().rss,
        eventLoopMaxMs: Math.round(delay.max / 1e6),
        skipped, dropped: journal.stats?.dropped ?? 0, ioFailures: journal.stats?.failures ?? 0 });
      delay.reset();
    } catch { skipped++; }
  }, sweepMs);
  timer.unref();
  write({ event: "observer-ready", node: process.version });
  return () => {
    unsubscribe("http.server.request.start", onRequest);
    clearInterval(timer); delay.disable();
    for (const state of active.values()) state.detach();
    active.clear();
  };
}

// Loaded before Next's HTTP server, separately for Web and Studio. Off by default.
if (process.env.NP_REQUEST_DIAGNOSTICS === "1") {
  try {
    if (!["web", "studio"].includes(process.env.NP_DIAGNOSTICS_SERVICE)) throw new Error("Unknown service");
    const journal = await createJournal(process.env.NP_DIAGNOSTICS_DIR ?? "", process.env.NP_DIAGNOSTICS_SERVICE ?? "");
    observeHttp({ service: process.env.NP_DIAGNOSTICS_SERVICE, journal });
    // Do not intercept SIGTERM/SIGINT or alter Next's shutdown behavior.
    process.once("beforeExit", () => { void journal.close().catch(() => {}); });
  } catch {
    console.error("[np-diagnostics] request observer unavailable; application startup continues");
  }
}
