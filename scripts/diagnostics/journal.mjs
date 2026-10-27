import { mkdir, open, rename, unlink, lstat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { unlinkSync } from "node:fs";

// Bounded, private, single-writer journal. Never print an I/O error containing paths.
export async function createJournal(directory, name, { maxBytes = 8 * 1024 * 1024, files = 8, maxPending = 256 } = {}) {
  if (!isAbsolute(directory) || !/^(web|studio|origin|external)$/.test(name)
    || !Number.isInteger(files) || files < 2 || files > 16 || !Number.isInteger(maxBytes) || maxBytes < 128
    || !Number.isInteger(maxPending) || maxPending < 1
    || resolve(directory).split(/[\\/]/).some(part => /^(public|public_html|media|storage)$/i.test(part))) {
    throw new Error("Diagnostics require a private absolute directory and a known service");
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStat = await lstat(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()
    || (process.platform !== "win32" && ((directoryStat.mode & 0o077) !== 0 || directoryStat.uid !== process.getuid()))) {
    throw new Error("Diagnostics directory must be private, owned by this user and not a symlink");
  }
  const base = join(directory, name);
  // An unclean shutdown leaves this lock. An operator must verify the old PID
  // is gone before removing it; never automatically steal another writer's lock.
  const lock = await open(`${base}.lock`, "wx", 0o600);
  await lock.writeFile(`${process.pid}\n`);
  let handle, bytes = 0, pending = 0, chain = Promise.resolve(), closed = false;
  const stats = { dropped: 0, failures: 0 };
  async function rotate() {
    await handle?.close();
    handle = undefined;
    for (let i = files - 1; i >= 1; i--) {
      try { await rename(`${base}.${i - 1}.jsonl`, `${base}.${i}.jsonl`); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    // wx refuses symlinks and unexpected existing files at the new active path.
    handle = await open(`${base}.0.jsonl`, "wx", 0o600);
    bytes = 0;
  }
  try { await rotate(); }
  catch (error) { await lock.close(); await unlink(`${base}.lock`); throw error; }
  const releaseOnExit = () => { try { unlinkSync(`${base}.lock`); } catch {} };
  process.once("exit", releaseOnExit);
  return {
    stats,
    write(record) {
      if (closed || pending >= maxPending) { stats.dropped++; return false; }
      const line = JSON.stringify(record) + "\n";
      const length = Buffer.byteLength(line);
      if (length > maxBytes) { stats.dropped++; return false; }
      pending++;
      chain = chain.then(async () => {
        if (bytes + length > maxBytes) await rotate();
        await handle.writeFile(line);
        bytes += length;
      }).catch(() => {
        if (stats.failures++ === 0) console.error("[np-diagnostics] journal I/O failed; evidence may be incomplete");
      }).finally(() => { pending--; });
      return true;
    },
    async flush() { await chain; },
    async close() {
      closed = true;
      await chain;
      await handle?.close();
      await lock.close();
      await unlink(`${base}.lock`);
      process.removeListener("exit", releaseOnExit);
    },
  };
}
