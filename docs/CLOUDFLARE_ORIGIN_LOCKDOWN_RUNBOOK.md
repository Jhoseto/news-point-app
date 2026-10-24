# NewsPoint origin lockdown runbook

Status: **planned, not executed**  
Prepared: 2026-10-24  
Target: `newspoint.bg` and `www.newspoint.bg` only  
Maintenance window: choose a period with low reader traffic and keep an operator available for rollback.

## 1. Goal

Force public web requests for `newspoint.bg` and `www.newspoint.bg` through Cloudflare so an attacker cannot bypass the configured WAF, DDoS controls, bot protection and rate limiting by connecting directly to `95.217.114.220`.

The change must not restrict or reconfigure:

- SPanel at `https://95.217.114.220/spanel/`;
- SSH on port 6543;
- mail protocols or webmail;
- the separate `newspoint` hosting account or its files, databases and mailboxes;
- other domains or virtual hosts on `95.217.114.220`;
- NewsPoint content, Postgres, `/home/np2/storage`, archive URLs or media.

This is a vhost-level HTTP/HTTPS control, not a global firewall change.

## 2. Current verified state

- Public Cloudflare zone: `newspoint.bg`, Free plan.
- Apex and `www` are proxied through Cloudflare.
- SSL mode is Full (strict) with the validated origin certificate.
- Origin IP: `95.217.114.220`.
- Direct external HTTPS with SNI/Host `newspoint.bg` currently returns the production Next.js homepage with HTTP 200. The bypass is therefore real.
- Server web stack reports Apache `2.4.69 (codeit)`.
- The unprivileged `np2` SSH account cannot read `/etc/httpd/conf/httpd.conf`, list loaded Apache modules or edit/reload the vhost. Execution requires the SPanel/root administrator or the hosting provider.
- The server is shared. SPanel, mail and another hosting account use the same public IP.
- Cloudflare edge hardening already active: automatic HTTP DDoS protection, Bot Fight Mode, Browser Integrity Check, AI Labyrinth, default managed protections, `Block retired WordPress endpoints`, `Block AmazonBot`, `Emergency per-IP burst guard`, and Tiered Cache.

## 3. Recommended design

Use two controls inside only the `newspoint.bg` Apache virtual hosts:

1. **Authenticated Origin Pulls (AOP) for HTTPS.** Cloudflare presents a client certificate; the NewsPoint TLS vhost requires it. A direct client cannot complete the same authenticated origin request. Global AOP is global to the Cloudflare *zone*, not to the whole server; enforcement remains scoped to the NewsPoint Apache vhost.
2. **Cloudflare peer-IP allowlist for HTTP and HTTPS.** Evaluate Apache's underlying connection address (`CONN_REMOTE_ADDR`), not `REMOTE_ADDR`. `mod_remoteip` may replace `REMOTE_ADDR` with the reader's IP from `CF-Connecting-IP`; using it for this check would block legitimate Cloudflare traffic.

Do not use a secret request header as the primary control. Do not add a global `iptables`, `nftables`, CSF or SPanel firewall deny for ports 80/443: a network firewall cannot distinguish name-based virtual hosts before the HTTP/TLS routing required here and may lock out SPanel or other domains.

### Security boundary

This design blocks application-layer direct access to the NewsPoint hostname. Because the machine has a shared public IP, it cannot make the entire IP immune to a volumetric layer-3/layer-4 attack without protecting or moving the whole IP/network (for example, a provider mitigation service or Cloudflare Magic Transit). Do not report this vhost change as whole-server DDoS protection.

## 4. Stop conditions

Stop without changing production if any of the following is true:

- root/SPanel administrator access is unavailable;
- the exact port 80 and 443 vhosts serving `newspoint.bg` and `www.newspoint.bg` cannot be identified;
- SPanel offers no persistent custom vhost include and would overwrite a manual edit;
- `ssl_module`, `authz_core_module`, `rewrite_module`, or the expected `remoteip_module` state cannot be verified;
- Apache config test does not pass cleanly before reload;
- the current Cloudflare IPv4/IPv6 lists cannot be downloaded from official endpoints;
- there is no tested rollback file and command;
- public traffic is elevated or the operator cannot observe the site for at least 15 minutes afterward.

If SPanel owns/generated the vhost and has no supported include, give this runbook to the hosting provider. Do not patch a generated base file that will later be silently replaced.

## 5. Maintenance preparation

Have all of these ready before the window:

- one open SPanel admin session;
- the existing SSH route on port 6543 tested from a second terminal;
- a second external connection/device for direct-origin testing;
- access to the Cloudflare dashboard;
- root shell or a hosting technician who can edit and gracefully reload Apache;
- the exact persistent vhost include path for both port 80 and port 443;
- a timestamped copy of every file that will be modified;
- a copy of the current Apache include graph and vhost map;
- the current public smoke-test URLs and the rollback steps below.

Record the starting state:

```bash
date -Is
apachectl -v
apachectl -M
apachectl -S
apachectl -t
systemctl status httpd --no-pager
```

The service name may differ on SPanel. Discover it; do not guess or restart unrelated services.

Verify these modules in `apachectl -M`:

```text
ssl_module
authz_core_module
rewrite_module
remoteip_module   # if real visitor IP restoration is configured
```

Locate the actual NewsPoint vhosts and all included files. Confirm `ServerName newspoint.bg`, `ServerAlias www.newspoint.bg`, the certificate directives, and the reverse proxy to the current Next.js service. Do not infer the target file from its filename alone.

## 6. Refresh Cloudflare network data

Immediately before execution, fetch the live lists from Cloudflare. Do not blindly reuse the snapshot in this document.

```bash
CF_WORK_DIR="$(mktemp -d)"
curl --fail --silent --show-error https://www.cloudflare.com/ips-v4/ -o "$CF_WORK_DIR/ips-v4"
curl --fail --silent --show-error https://www.cloudflare.com/ips-v6/ -o "$CF_WORK_DIR/ips-v6"
wc -l "$CF_WORK_DIR/ips-v4" "$CF_WORK_DIR/ips-v6"
sed -n '1,40p' "$CF_WORK_DIR/ips-v4"
sed -n '1,40p' "$CF_WORK_DIR/ips-v6"
```

Expected snapshot as of 2026-10-24 (comparison only):

```text
IPv4
173.245.48.0/20
103.21.244.0/22
103.22.200.0/22
103.31.4.0/22
141.101.64.0/18
108.162.192.0/18
190.93.240.0/20
188.114.96.0/20
197.234.240.0/22
198.41.128.0/17
162.158.0.0/15
104.16.0.0/13
104.24.0.0/14
172.64.0.0/13
131.0.72.0/22

IPv6
2400:cb00::/32
2606:4700::/32
2803:f800::/32
2405:b500::/32
2405:8100::/32
2a06:98c0::/29
2c0f:f248::/32
```

If the live list differs, review and regenerate the vhost include before proceeding. Establish a recurring operational check for future Cloudflare range changes.

## 7. Prepare Authenticated Origin Pulls safely

Cloudflare's AOP CA certificate is different from the existing Cloudflare Origin CA server certificate. The former validates Cloudflare as the TLS client; the latter lets Cloudflare validate the NewsPoint server.

1. Download the current Cloudflare authenticated-origin-pull CA certificate from the official Cloudflare AOP setup page.
2. Save it in a root-owned certificate directory outside the repository and web roots.
3. Set ownership to root and permissions to read-only for the Apache process as required by the distribution.
4. Add the following only inside the NewsPoint `*:443` vhost or its persistent SSL include, initially in observation mode:

```apache
SSLCACertificateFile /ROOT_MANAGED_PATH/cloudflare-origin-pull-ca.pem
SSLVerifyClient optional
SSLVerifyDepth 1
```

5. Add temporary diagnostic logging to the same vhost using the underlying connection peer and TLS verification result. Adapt only the log path to the distribution:

```apache
LogFormat "%t peer=%{c}a visitor=%a tls_client=%{SSL_CLIENT_VERIFY}x host=%v request=\"%r\" status=%>s" np_origin_lock
CustomLog /ROOT_MANAGED_LOG_PATH/newspoint-origin-lock.log np_origin_lock
```

6. Run `apachectl -t`. Do not reload unless it returns `Syntax OK`.
7. Gracefully reload Apache; do not perform a hard restart.
8. Verify the public site still returns 200 through Cloudflare.

At this stage direct HTTPS still works because client verification is optional. This is deliberate.

## 8. Enable AOP in Cloudflare

In Cloudflare, open SSL/TLS → Origin Server → Authenticated Origin Pulls and enable Global AOP for the `newspoint.bg` zone. This does not replace Full (strict); both remain active.

Immediately verify through Cloudflare:

- `/` returns 200 and the expected NewsPoint title;
- a current article returns 200;
- `/admin/` keeps its expected redirect to `/admin/login/`;
- `/api/live/` establishes a 200 event stream;
- a `/media/news/...` image returns 200/206 as appropriate;
- a Range request to a media file works;
- the origin log records `tls_client=SUCCESS` for the Cloudflare request.

If the public request does not log successful client-certificate verification, disable AOP in Cloudflare and restore the pre-change Apache include. Do not proceed to enforcement.

## 9. Enforce AOP on the NewsPoint TLS vhost

Change only the NewsPoint `*:443` vhost setting:

```apache
SSLVerifyClient require
```

Run `apachectl -t` again and gracefully reload. Repeat the complete public smoke matrix before adding any IP restriction.

Expected results:

- normal public requests through Cloudflare continue to work;
- an external direct request to `95.217.114.220` with SNI/Host `newspoint.bg` fails TLS client authentication or is otherwise rejected before reaching Next.js;
- SPanel by IP still opens because its own TLS vhost does not contain `SSLVerifyClient require`;
- SSH and mail are unchanged.

## 10. Add peer-IP defense in depth

Generate a vhost-scoped authorization block from the freshly downloaded official ranges. The semantic form is:

```apache
<Location "/">
    <RequireAny>
        Require expr "%{CONN_REMOTE_ADDR} -ipmatch '173.245.48.0/20'"
        # one Require expr line for every current Cloudflare IPv4 and IPv6 range
    </RequireAny>
</Location>
```

Apply the generated block only to the NewsPoint vhosts. It is required on port 80, where AOP cannot operate, and is defense in depth on port 443. Do not use `Require ip` against the rewritten visitor address and do not use the spoofable `CF-Connecting-IP` header for the allow decision.

Before production use, the root operator must test how this `<Location>` block merges with the existing SPanel-generated authorization and proxy configuration. If an existing `<Location>`, `<Proxy>`, `Require all granted`, application authentication, WebSocket/SSE route, or generated include conflicts, stop and move the check to a supported vhost rewrite/include mechanism. Do not stack authorization directives without confirming the effective merge.

For a rewrite-based alternative, use `CONN_REMOTE_ADDR` with Apache `ap_expr` and a forbidden action. The root operator must validate the final generated syntax with the installed Apache 2.4.69; do not paste an untested expression into production.

After config validation, gracefully reload and repeat all tests.

## 11. Acceptance tests

### A. Through Cloudflare

All must pass:

```text
GET  /                         -> 200
GET  current article           -> 200
GET  /admin/                   -> expected 307 to /admin/login/
GET  /api/live/                -> 200 stream establishment
GET  /media/news/...           -> 200 or 206
HEAD hashed /_next/static/...  -> 200 and cacheable
GET  retired WordPress paths   -> 403 from Cloudflare
```

Also perform an authenticated Studio login/read check without editing content, and verify browser console/network behavior for the homepage and one article.

### B. Direct origin from an external network

Use an external machine, not `127.0.0.1` on the server:

```bash
curl --resolve newspoint.bg:443:95.217.114.220 https://newspoint.bg/
curl --resolve www.newspoint.bg:443:95.217.114.220 https://www.newspoint.bg/
curl -I -H 'Host: newspoint.bg' http://95.217.114.220/
```

Success means none of these reaches the Next.js homepage. An AOP TLS failure or Apache 403 is acceptable. A 200, application 404 or Next.js response is a failure because it proves the origin remains reachable.

Do not use `-k` for the public Cloudflare checks. It may be used only for the deliberate direct-origin diagnostic when documenting the exact TLS behavior.

### C. Services that must remain available

- SPanel opens at `https://95.217.114.220/spanel/` from the administrator's normal network.
- Existing SPanel session remains usable.
- SSH on port 6543 connects.
- SMTP/IMAP/POP services used by the hosted mail accounts remain available.
- Other domains on the server respond exactly as before.
- The `newspoint` hosting account and its data are unchanged.

### D. Observability

For at least 15 minutes, watch:

- Cloudflare 5xx, especially 521, 522, 525 and 526;
- Apache error log and NewsPoint origin-lock log;
- Web/Studio/worker logs;
- homepage/article latency;
- media Range requests;
- Studio/API authentication and SSE/WebSocket behavior.

Do not declare completion while any new origin/TLS errors are present.

## 12. Rollback

Rollback triggers include any public 52x, failed SPanel/SSH/mail check, unexpected authentication loop, broken media/streaming, or inability to explain Apache errors.

Rollback order:

1. Remove or disable the NewsPoint peer-IP restriction from both vhosts.
2. Change `SSLVerifyClient require` back to `optional` (or restore the exact timestamped pre-change vhost include).
3. Run `apachectl -t`; require `Syntax OK`.
4. Gracefully reload Apache.
5. Disable Global AOP for the Cloudflare zone.
6. Repeat the public, direct-origin and service checks.
7. Keep the diagnostic logs and record the failure; do not delete evidence during the incident.

If Apache cannot reload but the old process is still serving, do not hard-stop it. Correct/restore the configuration first and re-run `apachectl -t`.

## 13. Completion evidence

Record all of the following in `docs/PLAN.md` after execution:

- maintenance start/end time and operator;
- exact persistent include files changed and their backup paths;
- Apache version, loaded modules and successful config-test output;
- SHA-256 of the AOP CA file (never record private keys or tokens);
- live Cloudflare IPv4/IPv6 source URLs and retrieval time;
- Cloudflare AOP level enabled;
- public smoke results;
- direct-origin rejection results from an external network;
- SPanel, SSH, mail and other-domain checks;
- 15-minute observation results;
- any rollback performed.

The task is complete only when public Cloudflare traffic works, direct NewsPoint origin access is rejected, and every non-NewsPoint service listed above is demonstrably unaffected.

## 14. Official references

- [Cloudflare IP addresses](https://developers.cloudflare.com/fundamentals/concepts/cloudflare-ip-addresses/)
- [Current Cloudflare IPv4 ranges](https://www.cloudflare.com/ips-v4/)
- [Current Cloudflare IPv6 ranges](https://www.cloudflare.com/ips-v6/)
- [Protect your origin server](https://developers.cloudflare.com/fundamentals/security/protect-your-origin-server/)
- [Authenticated Origin Pulls](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/)
- [Global AOP setup](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/set-up/global/)
- [Apache expressions and `CONN_REMOTE_ADDR`](https://httpd.apache.org/docs/current/expr.html)
- [Apache `mod_remoteip`](https://httpd.apache.org/docs/current/en/mod/mod_remoteip.html)
- [Apache access control](https://httpd.apache.org/docs/2.4/howto/access.html)

