import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

/** Render only: the caller decides when an explicitly authorized release installs the config. */
export function renderIngress(publicUrl) {
  let url;
  try { url = new URL(publicUrl ?? ""); } catch { throw new Error("WEB_URL must be an HTTPS origin before preparing the ingress."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || !/^\/*$/.test(url.pathname)
    || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(url.hostname) || !url.hostname.includes(".") || isIP(url.hostname)) {
    throw new Error("WEB_URL must be an HTTPS hostname without credentials, port, path or query.");
  }
  const host = url.hostname.toLowerCase();
  const hostPattern = host.replace(/\./g, "\\.");
  return `# Generated from validated WEB_URL. Requires TLS at Apache and Cloudflare Full (strict).
# Never trust browser-supplied X-Forwarded-Proto for the HTTPS redirect decision.
RewriteEngine On
RewriteCond %{HTTPS} !=on [OR]
RewriteCond %{HTTP_HOST} !^${hostPattern}(?::443)?$ [NC]
RewriteRule ^ https://${host}%{REQUEST_URI} [R=308,L]

# RequestHeader runs before the local application proxy. Overwrite any caller values.
# With Cloudflare, RemoteIPHeader must be configured with ONLY trusted proxy networks
# at virtual-host level; otherwise this remains the socket peer rather than the visitor.
SetEnvIf Remote_Addr "(.+)" NP_CLIENT_IP=$1
RequestHeader set X-Real-IP %{NP_CLIENT_IP}e env=NP_CLIENT_IP
RequestHeader set X-Forwarded-For %{NP_CLIENT_IP}e env=NP_CLIENT_IP
RequestHeader set X-Forwarded-Proto "https"
RequestHeader set X-Forwarded-Host "${host}"
RequestHeader unset Forwarded

RewriteRule ^index\\.html$ http://127.0.0.1:3100/ [P,L]
RewriteCond %{REQUEST_URI} !^/\\.well-known/
RewriteRule ^ http://127.0.0.1:3100%{REQUEST_URI} [P,L,QSA]
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const env = process.argv[2] ? parseEnv(readFileSync(process.argv[2], "utf8")) : process.env;
    process.stdout.write(renderIngress(env.WEB_URL));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not prepare ingress configuration.");
    process.exitCode = 1;
  }
}
