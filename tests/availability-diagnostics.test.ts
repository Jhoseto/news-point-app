import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server, type RequestListener } from "node:http";
import { createServer as createH2Server } from "node:http2";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { probe, probeH2, targets, apacheSummary, assess, cycle } from "../scripts/diagnostics/availability.mjs";
import { observeHttp, requestLabels } from "../scripts/diagnostics/http-observer.mjs";
import { createJournal } from "../scripts/diagnostics/journal.mjs";

const servers: Server[] = [];
const cleanup: Array<() => unknown> = [];
async function server(handler: RequestListener) {
  const s = createServer(handler); servers.push(s);
  s.listen(0, "127.0.0.1"); await once(s, "listening");
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`;
}
async function eventually(check: () => boolean) {
  const end = Date.now() + 2000;
  while (!check()) { if (Date.now() > end) throw new Error("Expected diagnostic event was not recorded"); await new Promise(r => setTimeout(r, 10)); }
}
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn();
  for (const s of servers.splice(0)) { s.closeAllConnections(); await new Promise<void>(r => s.close(() => r())); }
});

describe("independent availability probes (explicit local HTTP fixtures)", () => {
  it("independently records real HTTP/2 success and a stalled h2 stream", async () => {
    const s = createH2Server();
    s.on("stream", (stream, headers) => {
      stream.on("error", () => {});
      if (headers[":path"] !== "/stall") { stream.respond({ ":status": 200, "cf-ray": "a50f8fe3fd5a4d27-SOF" }); stream.end("h2 fixture"); }
    });
    s.listen(0, "127.0.0.1"); await once(s, "listening");
    const url = `http://127.0.0.1:${(s.address() as { port: number }).port}`;
    try {
      expect(await probeH2({ name: "public-home-h2", url })).toMatchObject({ outcome: "ok", transport: "h2", status: 200 });
      expect(await probeH2({ name: "public-home-h2", url: url + "/stall" }, { timeoutMs: 60 })).toMatchObject({ outcome: "timeout", transport: "h2" });
    } finally { await new Promise<void>(done => s.close(() => done())); }
  });
  it("distinguishes success, HTTP errors and Cloudflare challenges without saving body/headers", async () => {
    const url = await server((req, res) => {
      res.setHeader("Set-Cookie", "private-session=SECRET");
      res.setHeader("CF-Ray", "a50f8fe3fd5a4d27-SOF");
      if (req.url === "/524") { res.statusCode = 524; res.end("private error content"); }
      else if (req.url === "/challenge") { res.statusCode = 403; res.setHeader("CF-Mitigated", "challenge"); res.end("challenge"); }
      else res.end("healthy");
    });
    const good = await probe({ name: "fixture", url });
    expect(good).toMatchObject({ status: 200, outcome: "ok", bytes: 7, cfRay: "a50f8fe3fd5a4d27-SOF" });
    expect(await probe({ name: "fixture", url: url + "/524" })).toMatchObject({ status: 524, outcome: "http-error" });
    const challenge = await probe({ name: "public-home", url: url + "/challenge" });
    expect(challenge.outcome).toBe("cloudflare-challenge");
    expect(assess([challenge]).status).toBe("visibility-limited");
    expect(JSON.stringify(good)).not.toMatch(/SECRET|Set-Cookie|healthy|127\.0/);
  });
  it("bounds total timeout before headers and stalled bodies, including SSE headers without bytes", async () => {
    const url = await server((req, res) => { if (req.url !== "/headers-stall") { res.setHeader("Content-Type", "text/event-stream"); res.flushHeaders(); } });
    for (const [path, mode] of [["/headers-stall", "body"], ["/body-stall", "body"], ["/sse", "first-byte"]]) {
      const result = await probe({ name: "fixture-sse", url: url + path, mode }, { timeoutMs: 60 });
      expect(result.outcome).toBe("timeout"); expect(result.durationMs).toBeLessThan(1500);
    }
  });
  it("checks SSE first bytes without holding the monitor open or mistaking HTML for a stream", async () => {
    const url = await server((req, res) => {
      if (req.url === "/sse") { res.setHeader("Content-Type", "text/event-stream"); res.write("retry: 3000\n\n"); }
      else res.end("login HTML");
    });
    expect(await probe({ name: "public-sse", url: url + "/sse", mode: "first-byte" })).toMatchObject({ outcome: "ok", scope: "first-byte" });
    expect(await probe({ name: "public-sse", url, mode: "first-byte" })).toMatchObject({ outcome: "unexpected-content-type" });
  });
  it("detects incomplete and oversized bodies and refuses to follow redirects", async () => {
    const url = await server((req, res) => {
      if (req.url === "/big") res.end("x".repeat(500));
      else if (req.url === "/redirect") { res.writeHead(302, { Location: "http://must-not-contact.invalid/secret" }); res.end(); }
      else { res.writeHead(200, { "Content-Length": "1000" }); res.write("short"); setTimeout(() => res.destroy(), 20); }
    });
    expect((await probe({ name: "fixture", url: url + "/big" }, { maxBytes: 128 })).outcome).toBe("body-limit");
    expect((await probe({ name: "fixture", url: url + "/redirect" })).status).toBe(302);
    expect((await probe({ name: "fixture", url })).outcome).toBe("truncated");
  });
  it("isolates public failures from healthy local services and captures sanitized Apache evidence", async () => {
    const url = await server((req, res) => {
      if (req.url?.startsWith("/server-status")) res.end("BusyWorkers: 5\nIdleWorkers: 95\nStopping: 2\nClient: secret IP\nRequest: /secret?token=x\n");
      else if (req.url === "/failed") { res.statusCode = 524; res.end(); }
      else res.end("ok");
    });
    const result = await cycle({ profile: "origin", apacheUrl: url + "/server-status", selectedTargets: [
      { name: "web-home", url }, { name: "public-home", url: url + "/failed" },
    ] });
    expect(result.assessment).toMatchObject({ status: "investigate", publicFailedLocalHealthy: true, signals: ["public-home"] });
    expect(result.apache).toEqual({ available: true, BusyWorkers: 5, IdleWorkers: 95, Stopping: 2 });
    expect(JSON.stringify(result)).not.toMatch(/secret|token/);
    expect(apacheSummary("BusyWorkers: secret\nIdleWorkers: 9")).toBeNull();
    expect(targets("origin").filter(p => p.name === "studio-login")[0].url).toBe("http://127.0.0.1:3101/admin/login/");
    expect(() => targets("external", "https://user:secret@example.com")).toThrow();
    expect(() => targets("external", "https://example.com/path")).toThrow();
  });
});

describe("actual Node HTTP request observer", () => {
  it("preload is disabled by default and an invalid enabled configuration does not stop startup", async () => {
    const preload = new URL("../scripts/diagnostics/http-observer.mjs", import.meta.url).href;
    for (const enabled of ["0", "1"]) {
      const child = spawn(process.execPath, ["--import", preload, "--eval", "console.log('application-ready')"], {
        windowsHide: true, env: { ...process.env, NP_REQUEST_DIAGNOSTICS: enabled, NP_DIAGNOSTICS_DIR: "relative-invalid", NP_DIAGNOSTICS_SERVICE: "web" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "", stderr = "";
      child.stdout.on("data", b => { stdout += b; }); child.stderr.on("data", b => { stderr += b; });
      const [code] = await once(child, "exit");
      expect(code).toBe(0); expect(stdout).toContain("application-ready");
      expect(stderr.includes("observer unavailable")).toBe(enabled === "1");
    }
  });
  it("records start/finish, slow and aborted requests with bounded active SSE and no sensitive data", async () => {
    const records: any[] = [];
    const stop = observeHttp({ service: "web", journal: { write: (r: unknown) => records.push(r) }, slowMs: 20, sweepMs: 10 });
    cleanup.push(stop);
    const url = await server((req, res) => {
      if (req.url?.startsWith("/hang")) return;
      if (req.url?.startsWith("/api/live/")) { res.setHeader("Content-Type", "text/event-stream"); res.write("retry: 3000\n\n"); return; }
      res.end("normal content");
    });
    const headers = { "CF-Ray": "a50f8fe3fd5a4d27-SOF", Cookie: "SECRET", Authorization: "Bearer SECRET" };
    await probe({ name: "normal", url: url + "/admin/reset/SECRET?token=SECRET", headers });
    await probe({ name: "hung", url: url + "/hang?secret=SECRET", headers }, { timeoutMs: 80 });
    await probe({ name: "public-sse", url: url + "/api/live/", mode: "first-byte" });
    await eventually(() => records.some(r => r.event === "aborted" && r.route === "live-sse"));
    const start = records.find(r => r.event === "start" && r.route === "studio-page");
    expect(start.cfRay).toBe("a50f8fe3fd5a4d27-SOF");
    expect(records.find(r => r.event === "finish" && r.id === start.id)).toMatchObject({ status: 200, headersSent: true });
    expect(records.some(r => r.event === "slow" && r.route === "public-page")).toBe(true);
    expect(records.some(r => r.event === "aborted" && r.route === "public-page" && r.status === null)).toBe(true);
    expect(records.some(r => r.event === "slow" && r.route === "live-sse")).toBe(false);
    expect(JSON.stringify(records)).not.toMatch(/SECRET|Cookie|Authorization|normal content|127\.0/);
  });
  it("does not let a broken logger change HTTP behavior and drops malformed correlation fields", async () => {
    const stop = observeHttp({ service: "studio", journal: { write() { throw new Error("disk broke SECRET"); } } });
    cleanup.push(stop);
    const url = await server((_req, res) => { res.statusCode = 201; res.end("still works"); });
    expect((await probe({ name: "fixture", url, expected: 201 })).outcome).toBe("ok");
    expect(requestLabels({ url: "/", method: "GET", headers: { "cf-ray": "injected\nSECRET", "x-np-diagnostic-id": "SECRET" } })).toEqual({ route: "homepage", method: "GET" });
  });
});

describe("private bounded diagnostics journal", () => {
  it("rotates under its disk cap, uses exclusive ownership, and reveals dropped records", async () => {
    const dir = await mkdtemp(join(tmpdir(), "np-diagnostics-"));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    const journal = await createJournal(dir, "web", { maxBytes: 160, files: 3, maxPending: 1 });
    try {
      await expect(createJournal(dir, "web")).rejects.toThrow();
      expect(journal.write({ event: "one" })).toBe(true);
      expect(journal.write({ event: "dropped" })).toBe(false);
      await journal.flush();
      for (let i = 0; i < 12; i++) { journal.write({ event: "sample", index: i, padding: "x".repeat(45) }); await journal.flush(); }
      expect(journal.stats).toEqual({ dropped: 1, failures: 0 });
      const files = (await readdir(dir)).filter(n => n.endsWith(".jsonl"));
      expect(files).toHaveLength(3);
      for (const file of files) { expect((await stat(join(dir, file))).size).toBeLessThanOrEqual(160); JSON.parse((await readFile(join(dir, file), "utf8")).trim()); }
    } finally { await journal.close(); }
    expect((await readdir(dir)).some(n => n.endsWith(".lock"))).toBe(false);
    await expect(createJournal("relative", "web")).rejects.toThrow();
    await expect(createJournal(join(dir, "public"), "web")).rejects.toThrow();
  });
});
