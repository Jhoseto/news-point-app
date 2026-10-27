// Run only in an isolated QA directory; built-in Node modules, no app/DB access.
import { createServer } from "node:http";
import { createServer as createH2Server } from "node:http2";
import { once } from "node:events";
import { mkdtemp, readFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createJournal } from "../scripts/diagnostics/journal.mjs";
import { observeHttp } from "../scripts/diagnostics/http-observer.mjs";
import { probe, probeH2, cycle } from "../scripts/diagnostics/availability.mjs";

assert.equal(process.platform, "linux");
const dir = await mkdtemp(join(process.cwd(), "private-"));
const journal = await createJournal(dir, "web", { maxBytes: 2048, files: 3 });
const stop = observeHttp({ service: "web", journal, slowMs: 20, sweepMs: 10 });
const server = createServer((req, res) => {
  if (req.url === "/stall") return;
  if (req.url === "/fail") { res.statusCode = 524; res.end(); return; }
  if (req.url === "/server-status") { res.end("BusyWorkers: 9\nIdleWorkers: 91\nStopping: 2\nClient: secret\n"); return; }
  res.end("fixture only");
});
server.listen(0, "127.0.0.1"); await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}`;
try {
  const result = await probe({ name: "fixture", url, headers: { "CF-Ray": "a50f8fe3fd5a4d27-SOF" } });
  assert.equal(result.outcome, "ok");
  await new Promise(done => setTimeout(done, 30)); await journal.flush();
  const records = (await readFile(join(dir, "web.0.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert(records.some(r => r.event === "start" && r.cfRay === "a50f8fe3fd5a4d27-SOF" && r.probeId === result.probeId));
  assert(records.some(r => r.event === "finish" && r.status === 200));
  assert.equal((await stat(dir)).mode & 0o777, 0o700);
  assert.equal((await stat(join(dir, "web.0.jsonl"))).mode & 0o777, 0o600);
  const report = await cycle({ profile: "origin", apacheUrl: url + "/server-status", selectedTargets: [
    { name: "web-home", url }, { name: "public-home", url: url + "/fail" },
  ] });
  assert.equal(report.assessment.publicFailedLocalHealthy, true);
  assert.equal(report.apache.IdleWorkers, 91);
  assert(!JSON.stringify(report).includes("secret"));
  assert.equal((await probe({ name: "fixture", url: url + "/stall" }, { timeoutMs: 60 })).outcome, "timeout");
  const h2server = createH2Server();
  h2server.on("stream", stream => { stream.on("error", () => {}); stream.respond({ ":status": 200 }); stream.end("h2 fixture"); });
  h2server.listen(0, "127.0.0.1"); await once(h2server, "listening");
  try { assert.equal((await probeH2({ name: "fixture-h2", url: `http://127.0.0.1:${h2server.address().port}` })).outcome, "ok"); }
  finally { await new Promise(done => h2server.close(done)); }
  stop();
  for (let i = 0; i < 100; i++) { journal.write({ event: "rotation-fixture", i, padding: "x".repeat(120) }); await journal.flush(); }
  const files = (await readdir(dir)).filter(f => f.endsWith(".jsonl"));
  assert.equal(files.length, 3);
  for (const file of files) assert((await stat(join(dir, file))).size <= 2048);
  assert.equal(journal.stats.failures, 0);
  console.log(JSON.stringify({ passed: true, node: process.version, privateDirectory: "0700", journal: "0600", correlated: true, rotatingFiles: files.length, fixture524: true, timeout: true, http2: true }));
} finally { stop(); server.closeAllConnections(); await new Promise(done => server.close(done)); await journal.close(); }
