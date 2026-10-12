import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { getDb, studioAuditLogs } from "@newspoint/db";
import { sql } from "@newspoint/db/orm";
import type { AuditEntry } from "./audit-types";

let retryAfter = 0;
let flushing: Promise<void> | null = null;

export function auditBufferDirectory() {
  const directory = resolve(/* turbopackIgnore: true */ process.env.STUDIO_AUDIT_BUFFER_DIR || join(homedir(), "studio-audit"));
  if (process.env.MEDIA_ROOT) {
    const child = relative(resolve(process.env.MEDIA_ROOT), directory);
    if (child === "" || (!child.startsWith("..") && !isAbsolute(child))) throw new Error("Audit buffer must be outside public media");
  }
  return directory;
}

/** The WHERE prevents replay from changing a completed entry or downgrading it to pending. */
export async function insertAuditEntry(entry: AuditEntry) {
  const values = { ...entry, startedAt: new Date(entry.startedAt), occurredAt: new Date(entry.occurredAt) };
  await getDb().insert(studioAuditLogs).values(values).onConflictDoUpdate({
    target: studioAuditLogs.id,
    set: values,
    setWhere: sql`${studioAuditLogs.outcome} = 'pending' and excluded.outcome in ('success', 'failure')`,
  });
}

async function buffer(entry: AuditEntry) {
  const directory = auditBufferDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `${entry.startedAt.replace(/[:.]/g, "-")}_${entry.id}_${entry.outcome === "pending" ? "0" : "1"}_${randomUUID()}.json`;
  const temporary = join(directory, `${name}.tmp`);
  const handle = await open(/* turbopackIgnore: true */ temporary, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(entry), "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, join(directory, name));
  if (process.platform !== "win32") {
    const folder = await open(/* turbopackIgnore: true */ directory, "r");
    try { await folder.sync(); } finally { await folder.close(); }
  }
}

export async function auditBufferedCount() {
  try { return (await readdir(/* turbopackIgnore: true */ auditBufferDirectory())).filter(name => name.endsWith(".json")).length; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0; throw error; }
}

export async function flushAuditBuffer(force = false) {
  if (!force && Date.now() < retryAfter) return;
  if (flushing) return flushing;
  flushing = (async () => {
    let names: string[];
    try { names = await readdir(/* turbopackIgnore: true */ auditBufferDirectory()); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    const deadline = Date.now() + 750;
    for (const name of names.filter(name => /^[\w-]+\.json$/.test(name)).sort().slice(0, 200)) {
      if (Date.now() >= deadline) break;
      const path = join(auditBufferDirectory(), name);
      try {
        const entry = JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")) as AuditEntry;
        await insertAuditEntry(entry);
        await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        retryAfter = Date.now() + 5_000;
        return; // Keep the original file intact, including malformed files for recovery.
      }
    }
    retryAfter = 0;
  })().finally(() => { flushing = null; });
  return flushing;
}

/** A mutation may start only once its attempt has reached durable storage. */
export async function persistAudit(entry: AuditEntry): Promise<boolean> {
  if (Date.now() >= retryAfter) {
    try { await insertAuditEntry(entry); await flushAuditBuffer(); return true; }
    catch { retryAfter = Date.now() + 5_000; }
  }
  try { await buffer(entry); return true; }
  catch { console.error("Studio audit storage unavailable", entry.id); return false; }
}
