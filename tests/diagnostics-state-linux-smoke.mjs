// Isolated Linux QA only; no application, database or real SSH publisher access.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { saveMonitorState, publishExternal } from "../scripts/diagnostics/state.mjs";
import { PROBE_NAMES, safeState } from "../packages/content/src/error-monitoring.ts";

assert.equal(process.platform, "linux");
const directory = await mkdtemp(join(process.cwd(), "state-private-"));
const at = Date.now();
function cycle(offset, failed) {
  const stamp = new Date(at + offset).toISOString();
  return { profile: "external", startedAt: stamp, finishedAt: stamp,
    probes: PROBE_NAMES.filter(n => n.startsWith("public-")).map(name => ({ name, probeId: randomUUID(), transport: name.endsWith("-h2") ? "h2" : "http1", scope: "first-byte", outcome: failed ? "http-error" : "ok", status: failed ? 524 : 200, durationMs: 100, bytes: 1 })) };
}
await writeFile(join(directory, "external.0.jsonl"), JSON.stringify(cycle(0, true)) + "\n", { mode: 0o600 });
const state = await saveMonitorState(directory, cycle(60000, false));
assert.equal(state.incidents.length, 1);
assert.equal(state.incidents[0].checks, 1);
assert.equal(state.incidents[0].endedAt, state.checkedAt);
assert.equal((await stat(join(directory, "monitor-external.json"))).mode & 0o777, 0o600);
assert.equal((await stat(directory)).mode & 0o777, 0o700);
assert(safeState(JSON.parse(await readFile(join(directory, "monitor-external.json"), "utf8"))));

// Exercise the real publisher's arguments/stdin with a fake SSH executable.
const bin = join(directory, "bin"); await mkdir(bin);
await writeFile(join(bin, "ssh"), '#!/usr/bin/env node\nimport {writeFileSync} from "node:fs"; const chunks=[]; for await(const c of process.stdin) chunks.push(c); writeFileSync(process.env.QA_PAYLOAD,Buffer.concat(chunks)); writeFileSync(process.env.QA_ARGS,JSON.stringify(process.argv.slice(2)));\n', { mode: 0o700 });
const oldPath = process.env.PATH;
process.env.PATH = bin + ":" + oldPath;
process.env.QA_PAYLOAD = join(directory, "payload.json"); process.env.QA_ARGS = join(directory, "args.json");
try { await publishExternal({ ...state, secret: "MUST_BE_STRIPPED" }, { target: "np2@95.217.114.220", key: "/fixture/key", port: "6543" }); }
finally { process.env.PATH = oldPath; }
const payload = await readFile(process.env.QA_PAYLOAD, "utf8"), args = JSON.parse(await readFile(process.env.QA_ARGS, "utf8"));
assert(safeState(JSON.parse(payload))); assert(!payload.includes("MUST_BE_STRIPPED"));
assert(args.includes("BatchMode=yes")); assert(args.includes("np2@95.217.114.220"));
assert(args.at(-1).includes("monitor-external.json"));
await writeFile(join(directory, "publisher-command.sh"), args.at(-1));
console.log(JSON.stringify({ node: process.version, privateSnapshot: true, observedRecovery: true, atomicRoundtrip: true, publisherSanitization: true, realSshCalled: false, directory }));
