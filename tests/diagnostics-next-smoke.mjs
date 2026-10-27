// Explicit read-only smoke against a separate local Next process and existing build.
// No startup/deployment script or application source is changed.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { probe } from "../scripts/diagnostics/availability.mjs";

const root = resolve(import.meta.dirname, "..");
const reports = join(root, "tests/reports/availability-diagnostics-20261027");
await mkdir(reports, { recursive: true });
const dir = await mkdtemp(join(reports, "next-"));
await readFile(join(root, "apps/web/.next/BUILD_ID"));
const reservation = createServer();
reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
const port = reservation.address().port;
await new Promise(done => reservation.close(done));
const child = spawn(process.execPath, [
  "--import", pathToFileURL(join(root, "scripts/diagnostics/http-observer.mjs")).href,
  join(root, "apps/web/node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port),
], { cwd: join(root, "apps/web"), windowsHide: true,
  env: { ...process.env, NP_REQUEST_DIAGNOSTICS: "1", NP_DIAGNOSTICS_SERVICE: "web", NP_DIAGNOSTICS_DIR: dir },
  stdio: ["ignore", "pipe", "pipe"] });
let output = "", exited = false;
child.on("exit", () => { exited = true; });
child.stdout.on("data", b => { output = (output + b.toString()).slice(-12000); });
child.stderr.on("data", b => { output = (output + b.toString()).slice(-12000); });
async function until(check) {
  const end = Date.now() + 30000;
  while (!await check()) {
    if (Date.now() > end || exited) throw new Error("Isolated Next diagnostics smoke did not become ready");
    await new Promise(r => setTimeout(r, 50));
  }
}
try {
  await until(() => output.includes("Ready") && /127\.0\.0\.1:(\d+)/.test(output));
  const result = await probe({ name: "next-static", url: `http://127.0.0.1:${port}/sw.js`, headers: { "CF-Ray": "a50f8fe3fd5a4d27-SOF" } });
  assert.equal(result.outcome, "ok", `Isolated Next startup: ${output}`);
  let records;
  await until(async () => {
    records = (await readFile(join(dir, "web.0.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    return records.some(r => r.event === "finish" && r.probeId === result.probeId);
  });
  const start = records.find(r => r.event === "start" && r.probeId === result.probeId);
  const finish = records.find(r => r.event === "finish" && r.id === start?.id);
  assert.equal(start.route, "service-worker");
  assert.equal(finish.status, 200);
  assert.equal(start.cfRay, "a50f8fe3fd5a4d27-SOF");
  const report = { passed: true, kind: "existing-local-Next-build", node: process.version, result, start, finish,
    limitation: "Read-only static route on a separate local process; no production activation or full application build." };
  await writeFile(join(reports, "next-smoke.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: true, status: finish.status, correlated: true, journalFiles: (await readdir(dir)).length }));
} finally {
  if (!exited) {
    const closed = once(child, "exit"); child.kill("SIGTERM");
    const timer = setTimeout(() => { if (!exited) child.kill("SIGKILL"); }, 5000);
    await closed; clearTimeout(timer);
  }
}
