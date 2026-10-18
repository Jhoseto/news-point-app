import { describe, expect, it } from "vitest";
import { buildCustomRoute } from "next/dist/lib/build-custom-route";
import { developmentSlashRedirects } from "./dev-trailing-slash";

const rules = developmentSlashRedirects().map(rule => ({ ...rule, regex: new RegExp(buildCustomRoute("redirect", rule, ["/_next"]).regex) }));
function redirect(path: string, upgrade = false) {
  return rules.find(rule => !(upgrade && rule.missing?.some(item => item.key === "upgrade")) && rule.regex.test(path));
}

describe("development Studio upgrade routing", () => {
  it.each(["/plovdiv", "/admin", "/admin/login", "/plovdiv/archive/abc", "/кирилица"])("keeps the HTTP slash redirect for %s", path => {
    expect(redirect(path)?.destination).toBe("/:notfile/");
  });
  it.each(["/", "/plovdiv/", "/admin/login/", "/brand/favicon-32.png", "/.well-known/qa", "/.well-known/qa/"])("does not redirect an already valid URL %s", path => {
    expect(redirect(path)).toBeUndefined();
  });
  it("keeps file normalization but never redirects an upgrade", () => {
    expect(redirect("/brand/favicon-32.png/")?.destination).toBe("/:file");
    expect(redirect("/admin/_next/hmr", true)).toBeUndefined();
    expect(redirect("/admin/_next/hmr/", true)).toBeUndefined();
  });
});
