import { cityStorageDirectories } from "./storage";
import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function readProcedureFile(hash: string): Promise<Uint8Array | null> {
  if (!/^[a-f0-9]{64}$/u.test(hash)) return null;
  const directories = cityStorageDirectories("documents");
  for (const directory of directories) {
    try {
      const bytes = await readFile(resolve(directory, `${hash}.pdf`));
      if (bytes.length > 4_000_000 || bytes.subarray(0, 5).toString() !== "%PDF-" || createHash("sha256").update(bytes).digest("hex") !== hash) return null;
      return new Uint8Array(bytes);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null; }
  }
  return null;
}
