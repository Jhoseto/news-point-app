import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exclusions = ["node_modules", ".next", ".git", ".turbo", ".pnpm-store", ".env.local", ".env.tunnel", ".cursor", ".claude", ".codex", ".gemini", ".playwright-mcp", ".tts-cache", ".tts-voices", ".shots", "coverage", "playwright-report", "test-results", "blob-report", "out", "tests/reports", "docs/references", "docs/review", "*.tsbuildinfo"];

export function packDeployArchive(archive, root = repository) {
  const target = resolve(archive);
  // libarchive treats even --exclude=./logs as an unanchored directory exclusion.
  // Select root entries explicitly: omit only runtime ./logs, keep app/**/logs.
  const entries = readdirSync(root).filter(name => name !== "logs" && resolve(root, name) !== target && !exclusions.includes(name)).map(name => `./${name}`);
  const result = spawnSync("tar", ["-czf", target, ...exclusions.map(name => `--exclude=${name}`), "-C", root, ...entries], { encoding: "utf8", windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "Archive packing failed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw new Error("Usage: node scripts/pack-deploy-archive.mjs <archive.tgz>");
    packDeployArchive(process.argv[2]);
  } catch (error) { console.error(error instanceof Error ? error.message : "Archive packing failed."); process.exitCode = 1; }
}
