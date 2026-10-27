import "server-only";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { spawn } from "node:child_process";
import { monitoringView, safeState, type MonitoringView } from "@newspoint/content/error-monitoring";

const LIMIT = 1024 * 1024;
async function localSnapshot(directory: string, name: "origin" | "external") {
  let file;
  try {
    file = await open(resolve(/* turbopackIgnore: true */ directory, `monitor-${name}.json`), "r");
    if ((await file.stat()).size > LIMIT) return null;
    const state = safeState(JSON.parse(await file.readFile("utf8")));
    return state?.profile === name ? state : null;
  } catch { return null; } finally { await file?.close(); }
}
function remoteSnapshot(name: "origin" | "external") {
  const target = process.env.MEDIA_SSH_TARGET ?? "", key = process.env.MEDIA_SSH_KEY ?? "", port = process.env.MEDIA_SSH_PORT || "6543";
  if (!/^np2@(?:95\.217\.114\.220|server\.newspoint\.bg)$/.test(target) || !key || /[\r\n]/.test(key) || !/^\d{1,5}$/.test(port)) return Promise.resolve(null);
  return new Promise<ReturnType<typeof safeState>>(done => {
    const child = spawn("ssh", ["-i", key, "-p", port, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", target,
      `head -c ${LIMIT + 1} /home/np2/availability-diagnostics/monitor-${name}.json`], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = []; let bytes = 0, ended = false;
    const finish = (value: ReturnType<typeof safeState>) => { if (ended) return; ended = true; clearTimeout(timer); done(value); };
    const timer = setTimeout(() => { child.kill(); finish(null); }, 8000);
    child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > LIMIT) { child.kill(); finish(null); } else chunks.push(chunk); });
    child.on("error", () => finish(null));
    child.on("close", code => { try { const state = code === 0 ? safeState(JSON.parse(Buffer.concat(chunks).toString("utf8"))) : null; finish(state?.profile === name ? state : null); } catch { finish(null); } });
  });
}

let cached: { at: number; data: MonitoringView } | null = null;
let pending: Promise<MonitoringView> | null = null;
export async function readErrorMonitoring(): Promise<MonitoringView> {
  if (cached && Date.now() - cached.at < 15_000) return monitoringView(cached.data.sources.origin, cached.data.sources.external);
  if (pending) return pending;
  pending = (async () => {
    const configured = process.env.NP_DIAGNOSTICS_DIR?.trim();
    const remote = process.env.DEV_REMOTE === "1" && !configured;
    const directory = configured || resolve(homedir(), "availability-diagnostics");
    const read = (name: "origin" | "external") => remote ? remoteSnapshot(name) : isAbsolute(directory) ? localSnapshot(directory, name) : Promise.resolve(null);
    const [origin, external] = await Promise.all([read("origin"), read("external")]);
    const data = monitoringView(origin, external); cached = { at: Date.now(), data }; return data;
  })();
  try { return await pending; } finally { pending = null; }
}
