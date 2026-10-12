import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { verifyDeployArchive } from "./verify-deploy-archive.mjs";
import { packDeployArchive } from "./pack-deploy-archive.mjs";

let directory: string;
const files = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json", "apps/studio/next.config.ts", "apps/web/next.config.ts", "apps/studio/app/api/logs/route.ts", "apps/studio/app/(studio)/logs/page.tsx", "apps/web/app/page.tsx"];
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "np-deploy-archive-qa-"));
  for (const file of [...files, "logs/web.pid", "logs/private.log"]) { const target = join(directory, file); mkdirSync(resolve(target, ".."), { recursive: true }); writeFileSync(target, "QA archive fixture"); }
});
afterAll(() => { const target = resolve(directory); if (target.startsWith(join(tmpdir(), "np-deploy-archive-qa-"))) rmSync(target, { recursive: true, force: true }); });
function pack(exclusion: string) {
  const archive = join(directory, "fixture.tgz");
  const packed = spawnSync("tar", ["-czf", archive, `--exclude=${exclusion}`, "--exclude=fixture.tgz", "-C", directory, "."], { encoding: "utf8", windowsHide: true });
  expect(packed.status).toBe(0);
  const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8", windowsHide: true });
  expect(listing.status).toBe(0);
  return listing.stdout.split(/\r?\n/).filter(Boolean);
}
describe("Actual deployment tar exclusions", () => {
  it("keeps Logs pages/API while excluding only the root runtime directory", () => {
    const archive = join(directory, "fixture.tgz");
    packDeployArchive(archive, directory);
    const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8", windowsHide: true });
    expect(listing.status).toBe(0);
    const report = verifyDeployArchive(listing.stdout.split(/\r?\n/).filter(Boolean), directory);
    expect(report.missing).toEqual([]); expect(report.forbidden).toEqual([]);
  });
  it("catches the old broad exclusion before uploading a broken release", () => {
    const report = verifyDeployArchive(pack("logs"), directory);
    expect(report.missing).toContain("apps/studio/app/api/logs/route.ts");
    expect(report.missing).toContain("apps/studio/app/(studio)/logs/page.tsx");
  });
  it("refuses private environment files, runtime output and unsafe paths", () => {
    const report = verifyDeployArchive([...files, "./.env.local", "./logs/web.pid", "../escape", "./apps/web/.next/server/private.js"], directory);
    expect(report.forbidden).toHaveLength(4);
    expect(verifyDeployArchive([...files, ".env.example"], directory).forbidden).toEqual([]);
  });
});
