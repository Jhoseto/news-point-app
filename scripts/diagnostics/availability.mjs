import http from "node:http";
import https from "node:https";
import { connect, constants as h2 } from "node:http2";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { loadavg, freemem, totalmem, uptime } from "node:os";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createJournal } from "./journal.mjs";
import { saveMonitorState, publishExternal } from "./state.mjs";

export function probe({ name, url, mode = "body", expected = 200, headers = {} }, { timeoutMs = 8000, maxBytes = 65536 } = {}) {
  return new Promise(resolveResult => {
    const start = performance.now(), probeId = randomUUID();
    let settled = false, response, bytes = 0, headersMs = null, firstByteMs = null, status = null, cfRay;
    let challenged = false;
    const complete = outcome => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      resolveResult({ name, probeId, transport: "http1", scope: mode, outcome, status, headersMs, firstByteMs,
        durationMs: Math.round(performance.now() - start), bytes, ...(cfRay ? { cfRay } : {}) });
      response?.destroy(); request.destroy();
    };
    const request = (url.startsWith("https:") ? https : http).request(url, {
      method: "GET", agent: false,
      headers: { "User-Agent": "NewsPoint-Availability/1.0", ...headers, "X-NP-Diagnostic-ID": probeId },
    });
    const timer = setTimeout(() => complete("timeout"), timeoutMs);
    request.on("response", res => {
      response = res; status = res.statusCode; headersMs = Math.round(performance.now() - start);
      if (/^[a-f0-9]{16}(?:-[a-z]{3})?$/i.test(res.headers["cf-ray"] ?? "")) cfRay = res.headers["cf-ray"];
      challenged = res.headers["cf-mitigated"] === "challenge";
      const statusOutcome = () => challenged ? "cloudflare-challenge" : status === expected ? "ok" : status === 403 ? "denied" : "http-error";
      if (status !== expected || challenged) { complete(statusOutcome()); return; }
      if (mode === "first-byte" && name.endsWith("sse") && !/^text\/event-stream\b/.test(res.headers["content-type"] ?? "")) {
        complete("unexpected-content-type"); return;
      }
      res.on("data", chunk => {
        bytes += chunk.length;
        firstByteMs ??= Math.round(performance.now() - start);
        if (mode === "first-byte") complete(statusOutcome());
        else if (bytes > maxBytes) complete("body-limit");
      });
      res.on("end", () => complete(bytes ? statusOutcome() : "empty-body"));
      res.on("aborted", () => complete("truncated"));
      res.on("error", () => complete("connection-error"));
    });
    request.on("error", error => complete(["CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "ERR_TLS_CERT_ALTNAME_INVALID", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT"].includes(error.code) ? "tls-error" : "connection-error"));
    request.end();
  });
}

// Fresh HTTP/2 session, no silent HTTP/1 fallback; used alongside the HTTP/1 probes.
export function probeH2({ name, url, mode = "body", expected = 200 }, { timeoutMs = 8000, maxBytes = 65536 } = {}) {
  return new Promise(done => {
    const target = new URL(url), start = performance.now(), probeId = randomUUID();
    let settled = false, stream, status = null, headersMs = null, firstByteMs = null, bytes = 0, cfRay;
    const session = connect(target.origin);
    const finish = outcome => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      done({ name, probeId, transport: "h2", scope: mode, outcome, status, headersMs, firstByteMs,
        durationMs: Math.round(performance.now() - start), bytes, ...(cfRay ? { cfRay } : {}) });
      stream?.close(h2.NGHTTP2_CANCEL); session.destroy();
    };
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    session.on("error", () => finish("tls-or-h2-connection-error"));
    session.on("close", () => { if (!settled) finish("connection-error"); });
    session.on("connect", () => {
      if (settled) return;
      try {
        stream = session.request({ ":method": "GET", ":path": target.pathname + target.search,
          "user-agent": "NewsPoint-Availability/1.0", "x-np-diagnostic-id": probeId });
        stream.on("response", headers => {
          status = Number(headers[":status"]); headersMs = Math.round(performance.now() - start);
          if (/^[a-f0-9]{16}(?:-[a-z]{3})?$/i.test(headers["cf-ray"] ?? "")) cfRay = headers["cf-ray"];
          if (headers["cf-mitigated"] === "challenge") finish("cloudflare-challenge");
          else if (status !== expected) finish(status === 403 ? "denied" : "http-error");
        });
        stream.on("data", chunk => {
          bytes += chunk.length; firstByteMs ??= Math.round(performance.now() - start);
          if (mode === "first-byte") finish("ok");
          else if (bytes > maxBytes) finish("body-limit");
        });
        stream.on("end", () => finish(bytes ? "ok" : "empty-body"));
        stream.on("error", () => finish("connection-error"));
        stream.on("close", () => { if (!settled) finish("truncated"); });
        stream.end();
      } catch { finish("connection-error"); }
    });
  });
}

export function targets(profile, publicOrigin = "https://newspoint.bg") {
  const url = new URL(publicOrigin);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Public diagnostics URL must be an HTTPS origin");
  if (!["origin", "external"].includes(profile)) throw new Error("Choose origin or external profile");
  const publicTargets = [
    { name: "public-home", url: `${url.origin}/`, mode: "first-byte" },
    { name: "public-login", url: `${url.origin}/admin/login/` },
    { name: "public-static", url: `${url.origin}/sw.js` },
    { name: "public-sse", url: `${url.origin}/api/live/`, mode: "first-byte" },
    { name: "public-home-h2", url: `${url.origin}/`, mode: "first-byte", transport: "h2" },
    { name: "public-static-h2", url: `${url.origin}/sw.js`, transport: "h2" },
  ];
  if (profile === "external") return publicTargets;
  return [
    { name: "web-home", url: "http://127.0.0.1:3100/", mode: "first-byte" },
    { name: "web-static", url: "http://127.0.0.1:3100/sw.js" },
    { name: "web-login-rewrite", url: "http://127.0.0.1:3100/admin/login/" },
    { name: "studio-login", url: "http://127.0.0.1:3101/admin/login/" },
    ...publicTargets,
  ];
}

export function apacheSummary(text) {
  const allowed = new Set(["BusyWorkers", "IdleWorkers", "GracefulWorkers", "Processes", "Stopping", "ConnsTotal", "ConnsAsyncWaitIO", "ConnsAsyncWriting", "ConnsAsyncKeepAlive", "ConnsAsyncClosing", "Load1", "Load5", "Load15", "ServerUptimeSeconds", "ParentServerConfigGeneration", "ParentServerMPMGeneration"]);
  const result = {};
  for (const line of text.split("\n")) {
    const [key, value] = line.split(":", 2);
    if (allowed.has(key) && /^\s*\d+(?:\.\d+)?\s*$/.test(value ?? "")) result[key] = Number(value);
  }
  return typeof result.BusyWorkers === "number" && typeof result.IdleWorkers === "number" ? result : null;
}

export function snapshotApache(url = "http://127.0.0.1/server-status?auto", timeoutMs = 3000) {
  return new Promise(done => {
    let settled = false, text = "";
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); done(value); request.destroy(); };
    const request = http.get(url, { headers: { Host: "localhost", "User-Agent": "NewsPoint-Availability/1.0" }, agent: false }, res => {
      if (res.statusCode !== 200) { res.destroy(); finish({ available: false }); return; }
      res.on("data", chunk => { text += chunk.toString(); if (text.length > 16384) { res.destroy(); finish({ available: false }); } });
      res.on("end", () => { const summary = apacheSummary(text); finish(summary ? { available: true, ...summary } : { available: false }); });
      res.on("error", () => finish({ available: false }));
      res.on("aborted", () => finish({ available: false }));
    });
    const timer = setTimeout(() => finish({ available: false }), timeoutMs);
    request.on("error", () => finish({ available: false }));
  });
}

export function assess(probes, slowMs = 3000) {
  const bad = probes.filter(p => !["ok", "cloudflare-challenge", "denied"].includes(p.outcome) || p.durationMs >= slowMs);
  const denied = probes.filter(p => ["cloudflare-challenge", "denied"].includes(p.outcome));
  return {
    status: bad.length ? "investigate" : denied.length ? "visibility-limited" : "ok",
    signals: bad.map(p => p.name), denied: denied.map(p => p.name),
    // Evidence only; a public/local difference does not prove Apache or CF guilty.
    publicFailedLocalHealthy: bad.some(p => p.name.startsWith("public-"))
      && probes.some(p => p.name.startsWith("web-"))
      && probes.filter(p => !p.name.startsWith("public-")).every(p => p.outcome === "ok" && p.durationMs < slowMs),
  };
}

export async function cycle({ profile, publicOrigin, probeOptions, selectedTargets, apacheUrl } = {}) {
  const startedAt = new Date().toISOString();
  const [probes, apache] = await Promise.all([
    Promise.all((selectedTargets ?? targets(profile, publicOrigin)).map(target => (target.transport === "h2" ? probeH2 : probe)(target, probeOptions))),
    profile === "origin" ? snapshotApache(apacheUrl) : Promise.resolve(null),
  ]);
  return { event: "availability", startedAt, finishedAt: new Date().toISOString(), profile,
    assessment: assess(probes), probes, ...(apache ? { apache } : {}),
    observerHost: { uptimeSeconds: Math.floor(uptime()), load: loadavg(), freeBytes: freemem(), totalBytes: totalmem() } };
}

async function main() {
  const profile = process.argv[process.argv.indexOf("--profile") + 1];
  if (!process.argv.includes("--profile") || !["origin", "external"].includes(profile)
    || (process.argv.includes("--once") === process.argv.includes("--watch"))) throw new Error("Use --profile origin|external and exactly one of --once or --watch");
  // Validate before opening a journal; no arbitrary target list from the environment.
  const selectedTargets = targets(profile, process.env.NP_DIAGNOSTICS_PUBLIC_URL || undefined);
  const journal = await createJournal(process.env.NP_DIAGNOSTICS_DIR ?? "", profile);
  let stopping = false, wake;
  const stop = () => { stopping = true; wake?.(); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try {
    do {
      const result = await cycle({ profile, selectedTargets });
      if (!journal.write(result)) throw new Error("Diagnostics journal queue is full");
      await journal.flush();
      if (journal.stats.failures) throw new Error("Diagnostics journal write failed");
      const state = await saveMonitorState(process.env.NP_DIAGNOSTICS_DIR, result);
      if (profile === "external" && process.argv.includes("--publish-external")) {
        // Keep local evidence if SSH is down; Studio will show an expired external source.
        try { await publishExternal(state, { target: process.env.NP_DIAGNOSTICS_SSH_TARGET, key: process.env.NP_DIAGNOSTICS_SSH_KEY, port: process.env.NP_DIAGNOSTICS_SSH_PORT || "6543" }); }
        catch { console.error("[np-diagnostics] external snapshot not delivered; local evidence retained"); }
      }
      console.log(JSON.stringify({ at: result.finishedAt, profile, ...result.assessment }));
      if (process.argv.includes("--once") || stopping) break;
      await new Promise(done => { const timer = setTimeout(done, 60000); wake = () => { clearTimeout(timer); done(); }; if (stopping) wake(); });
      wake = undefined;
    } while (!stopping);
  } finally { process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop); await journal.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error("[np-diagnostics] monitor failed; check profile, private directory, lock and disk"); process.exitCode = 1; });
}
