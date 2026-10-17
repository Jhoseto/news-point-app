import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderIngress } from "../deploy/np2/render-ingress.mjs";

describe("trusted TLS ingress", () => {
  it("redirects before forwarding using the TLS connection and a fixed canonical host", () => {
    const config = renderIngress("https://newspoint.bg/");
    expect(config).toContain("RewriteCond %{HTTPS} !=on [OR]");
    expect(config).toContain("RewriteCond %{HTTP_HOST} !^newspoint\\.bg(?::443)?$ [NC]");
    expect(config).toContain("RewriteRule ^ https://newspoint.bg%{REQUEST_URI} [R=308,L]");
    expect(config.indexOf("[R=308,L]")).toBeLessThan(config.indexOf("[P,L]"));
    expect(config).not.toContain("%{HTTP:X-Forwarded-Proto}");
    expect(config).toContain('RequestHeader set X-Forwarded-Proto "https"');
    expect(config).toContain("RequestHeader set X-Forwarded-For %{NP_CLIENT_IP}e");
    expect(config).toContain("RequestHeader unset Forwarded");
  });
  it.each([undefined, "http://newspoint.bg", "https://newspoint.bg/admin", "https://newspoint.bg:8443", "https://newspoint.bg?x=1", "https://user:secret@newspoint.bg", "https://newspoint.bg/#x", "https://localhost", "https://127.0.0.1", "https://[::1]"])("refuses unsafe deployment origin %s", (origin) => {
    expect(() => renderIngress(origin)).toThrow("WEB_URL");
  });
  it("prepares ingress before stopping the old processes and reuses the renderer on restart", () => {
    const starter = readFileSync(new URL("../deploy/np2/start-newspoint.sh", import.meta.url), "utf8");
    expect(starter.indexOf('node "$APP/deploy/np2/render-ingress.mjs"')).toBeLessThan(starter.indexOf('stop_pid "$APP/logs/web.pid"'));
    expect(starter).not.toContain("cat > \"$HOME/public_html/.htaccess\"");
    expect(starter).toContain('mv "$APP/logs/ingress.htaccess.next" "$HOME/public_html/.htaccess"');
  });
});
