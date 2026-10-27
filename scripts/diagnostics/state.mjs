import { open, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { advanceMonitor, safeCycle, safeState, safeApp, safeIssue } from "../../packages/content/src/error-monitoring.ts";

export async function boundedJson(path) {
  let file;
  try {
    file = await open(path, "r");
    if ((await file.stat()).size > 1024 * 1024) return null;
    return JSON.parse(await file.readFile("utf8"));
  } catch { return null; } finally { await file?.close(); }
}
async function tail(path) {
  let file;
  try {
    file = await open(path, "r"); const size = (await file.stat()).size;
    const offset = Math.max(0, size - 192 * 1024), buffer = Buffer.alloc(size - offset);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
    if (offset) lines.shift();
    return lines.flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  } catch { return []; } finally { await file?.close(); }
}

export async function saveMonitorState(directory, rawCycle) {
  if (!rawCycle || !["origin", "external"].includes(rawCycle.profile)) throw new Error("Invalid diagnostics profile");
  let previous = safeState(await boundedJson(join(directory, `monitor-${rawCycle.profile}.json`)));
  if (!previous) {
    // One-time, bounded replay of retained journals; never fabricate earlier outages.
    for (let segment = 7; segment >= 0; segment--) {
      let handle;
      try {
        handle = await open(join(directory, `${rawCycle.profile}.${segment}.jsonl`), "r");
        if ((await handle.stat()).size > 8 * 1024 * 1024) continue;
        const lines = (await handle.readFile("utf8")).split("\n");
        for (const line of lines) { try { const c = safeCycle(JSON.parse(line)); if (c && Date.parse(c.finishedAt) < Date.parse(rawCycle.finishedAt)) previous = advanceMonitor(previous, c); } catch {} }
      } catch {} finally { await handle?.close(); }
    }
  }
  const apps = [], requestIssues = [];
  if (rawCycle.profile === "origin") {
    for (const service of ["web", "studio"]) {
      const rows = await tail(join(directory, `${service}.0.jsonl`));
      apps.push(safeApp(rows.findLast(row => row.event === "process"), service));
      requestIssues.push(...rows.map(safeIssue).filter(Boolean));
    }
  }
  const cycle = safeCycle({ ...rawCycle, apps, requestIssues });
  if (!cycle) throw new Error("Invalid diagnostics cycle");
  const state = advanceMonitor(previous, cycle);
  let text = JSON.stringify(state);
  while (Buffer.byteLength(text) > 1024 * 1024 && state.incidents.length > 1) { state.incidents.shift(); text = JSON.stringify(state); }
  if (Buffer.byteLength(text) > 1024 * 1024) throw new Error("Diagnostics state too large");
  const path = join(directory, `monitor-${cycle.profile}.json`), temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, text + "\n", { mode: 0o600 });
  await rename(temporary, path);
  return state;
}

/** Optional laptop -> own server over existing SSH access, never a public ingest API. */
export async function publishExternal(state, { target, key, port = "6543" }) {
  const clean = safeState(state);
  if (!clean || clean.profile !== "external" || !/^np2@(?:95\.217\.114\.220|server\.newspoint\.bg)$/.test(target ?? "") || typeof key !== "string" || !key || /[\r\n]/.test(key) || !/^\d{1,5}$/.test(port)) throw new Error("External diagnostics publisher configuration invalid");
  const payload = JSON.stringify(clean);
  if (Buffer.byteLength(payload) > 1024 * 1024) throw new Error("External diagnostics state too large");
  return new Promise((done, reject) => {
    const command = 'set -eu; umask 077; d=/home/np2/availability-diagnostics; test "$(stat -c %a:%U "$d")" = 700:np2; t=$(mktemp "$d/.external.XXXXXX"); trap \'rm -f -- "$t"\' EXIT; cat > "$t"; mv -- "$t" "$d/monitor-external.json"';
    const child = spawn("ssh", ["-i", key, "-p", port, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", target, command], { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] });
    const timer = setTimeout(() => { child.kill(); reject(new Error("External diagnostics upload timed out")); }, 8000);
    child.on("error", () => { clearTimeout(timer); reject(new Error("External diagnostics upload unavailable")); });
    child.on("close", code => { clearTimeout(timer); if (code === 0) done(); else reject(new Error("External diagnostics upload failed")); });
    child.stdin.on("error", () => {}); child.stdin.end(payload);
  });
}
