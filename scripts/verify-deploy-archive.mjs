import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceFiles = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json", "apps/studio/next.config.ts", "apps/web/next.config.ts", "apps/web/lib/indexing-policy.mjs", "deploy/np2/render-ingress.mjs",
  "apps/worker/src/facebook-post-image.ts", "apps/worker/assets/social/Manrope.ttf", "apps/worker/assets/social/OFL.txt", "apps/worker/assets/social/Montserrat.ttf", "apps/worker/assets/social/Montserrat-OFL.txt", "apps/web/public/brand/newspoint-logo-dark.webp"];
function appEntries(directory, prefix) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return appEntries(join(directory, entry.name), path);
    return /\.(?:tsx?|jsx?)$/.test(entry.name) ? [path] : [];
  });
}

/** Fail before upload if an exclusion silently removes a page, API or its colocated source. */
export function verifyDeployArchive(entries, root = repository) {
  const normalized = entries.map(path => path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, ""));
  const files = new Set(normalized);
  const required = [...sourceFiles, ...appEntries(join(root, "apps/studio/app"), "apps/studio/app"), ...appEntries(join(root, "apps/web/app"), "apps/web/app")];
  const missing = required.filter(path => !files.has(path));
  const forbidden = normalized.filter(path => {
    const parts = path.split("/");
    const name = parts.at(-1);
    return path.startsWith("/") || parts.includes("..") || parts.includes("node_modules") || parts.includes(".git") || parts.includes(".next")
      || path === "logs" || path.startsWith("logs/") || path === "tests/reports" || path.startsWith("tests/reports/")
      || (name?.startsWith(".env") && name !== ".env.example");
  });
  return { missing, forbidden, checked: required.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const archive = process.argv[2];
  if (!archive) { console.error("Usage: node scripts/verify-deploy-archive.mjs <archive.tgz>"); process.exitCode = 1; }
  else {
    const result = spawnSync("tar", ["-tzf", resolve(archive)], { encoding: "utf8", windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
    if (result.error || result.status !== 0) { console.error("Cannot inspect the deployment archive."); process.exitCode = 1; }
    else {
      const report = verifyDeployArchive(result.stdout.split(/\r?\n/).filter(Boolean));
      if (report.missing.length || report.forbidden.length) {
        if (report.missing.length) console.error("Missing source files:\n" + report.missing.slice(0, 12).join("\n"));
        if (report.forbidden.length) console.error("Private/generated paths must not be deployed:\n" + report.forbidden.slice(0, 12).join("\n"));
        process.exitCode = 1;
      } else console.log(`Archive source verified (${report.checked} required files; no private runtime paths).`);
    }
  }
}
