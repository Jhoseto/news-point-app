import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { verifyDeployArchive } from "./verify-deploy-archive.mjs";
import { packDeployArchive } from "./pack-deploy-archive.mjs";

let directory: string;
const files = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json", "apps/studio/next.config.ts", "apps/web/next.config.ts", "apps/web/lib/indexing-policy.mjs", "deploy/np2/render-ingress.mjs", "deploy/np2/verify-web-indexing.mjs", "apps/studio/app/api/logs/route.ts", "apps/studio/app/(studio)/logs/page.tsx", "apps/web/app/page.tsx",
  "apps/worker/src/facebook-post-image.ts", "apps/worker/assets/social/Manrope.ttf", "apps/worker/assets/social/OFL.txt", "apps/worker/assets/social/Montserrat.ttf", "apps/worker/assets/social/Montserrat-OFL.txt", "apps/web/public/brand/newspoint-logo-dark.webp"];
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "np-deploy-archive-qa-"));
  for (const file of [...files, "logs/web.pid", "logs/private.log", ".codex-remote-attachments/private.jpg", "AGENTS.md", "apps/web/AGENTS.md", "docs/PLAN.md", "docs/NEWSPOINT_2_FACEBOOK_PUBLISHING_PLAN.md"]) { const target = join(directory, file); mkdirSync(resolve(target, ".."), { recursive: true }); writeFileSync(target, "QA archive fixture"); }
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
    expect(listing.stdout).not.toMatch(/AGENTS\.md|docs\/PLAN\.md|NEWSPOINT_2_FACEBOOK_PUBLISHING_PLAN/);
  });
  it("catches the old broad exclusion before uploading a broken release", () => {
    const report = verifyDeployArchive(pack("logs"), directory);
    expect(report.missing).toContain("apps/studio/app/api/logs/route.ts");
    expect(report.missing).toContain("apps/studio/app/(studio)/logs/page.tsx");
  });
  it("refuses an archive missing the ingress or indexing policy required at startup", () => {
    const report = verifyDeployArchive(files.filter(path => !path.endsWith("render-ingress.mjs") && !path.endsWith("indexing-policy.mjs")), directory);
    expect(report.missing).toEqual(expect.arrayContaining(["deploy/np2/render-ingress.mjs", "apps/web/lib/indexing-policy.mjs"]));
  });
  it("refuses private environment files, runtime output and unsafe paths", () => {
    const report = verifyDeployArchive([...files, "./.env.local", "./logs/web.pid", "../escape", "./apps/web/.next/server/private.js"], directory);
    expect(report.forbidden).toHaveLength(4);
    expect(verifyDeployArchive([...files, ".env.example"], directory).forbidden).toEqual([]);
  });
  it("refuses missing social renderer, bundled Cyrillic font, license or wordmark", () => {
    const assets = files.filter(path => path.includes("facebook-post-image") || path.includes("assets/social/") || path.endsWith("newspoint-logo-dark.webp"));
    for (const asset of assets) expect(verifyDeployArchive(files.filter(path => path !== asset), directory).missing).toContain(asset);
  });
});
