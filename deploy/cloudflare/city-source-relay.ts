const RELAY_PATH = "/city-source-relay/v1";
const MAX_RESPONSE_BYTES = 4_000_000;
const MAX_CLOCK_SKEW_SECONDS = 300;
const ALLOWED_HOSTS = new Set(["www.lohicraftspace.com"]);

type RelayBindings = { CITY_SOURCE_RELAY_SECRET?: string };
type RelayFetcher = (input: Request, init?: RequestInit) => Promise<Response>;

function hex(value: ArrayBuffer) {
  return [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function validSignature(secret: string, timestamp: string, signedValue: string, signature: string) {
  if (!/^\d{10}$/u.test(timestamp) || !/^[a-f0-9]{64}$/u.test(signature)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(Date.now() / 1000) - seconds) > MAX_CLOCK_SKEW_SECONDS) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}\n${signedValue}`))) === signature;
}

function safeTarget(value: unknown) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !ALLOWED_HOSTS.has(url.hostname)) return null;
    return url;
  } catch { return null; }
}

export async function citySourceRelay(request: Request, env: RelayBindings, fetcher: RelayFetcher = fetch): Promise<Response | null> {
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname !== RELAY_PATH) return null;
  const reject = (status: number) => new Response(null, { status, headers: { "cache-control": "private, no-store" } });
  if (request.method !== "GET" || requestUrl.search || requestUrl.hash) return reject(405);
  const secret = env.CITY_SOURCE_RELAY_SECRET ?? "";
  if (secret.length < 32) return reject(403);
  const targetValue = request.headers.get("x-np-city-url") ?? "";
  const accept = request.headers.get("x-np-city-accept") ?? "text/html,application/xhtml+xml";
  const ifNoneMatch = request.headers.get("x-np-city-if-none-match") ?? "";
  const ifModifiedSince = request.headers.get("x-np-city-if-modified-since") ?? "";
  if (targetValue.length > 2000 || accept.length > 160 || ifNoneMatch.length > 300 || ifModifiedSince.length > 100) return reject(400);
  const signedValue = [targetValue, accept, ifNoneMatch, ifModifiedSince].join("\n");
  if (!await validSignature(secret, request.headers.get("x-np-city-timestamp") ?? "", signedValue, request.headers.get("x-np-city-signature") ?? "")) return reject(403);
  const target = safeTarget(targetValue);
  if (!target) return reject(400);
  const expectedHost = target.hostname;
  let current = target;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const headers = new Headers({
      accept,
      "user-agent": "NewsPointCity/1.0 (+https://newspoint.bg/)",
    });
    if (ifNoneMatch) headers.set("if-none-match", ifNoneMatch);
    if (ifModifiedSince) headers.set("if-modified-since", ifModifiedSince);
    let upstream: Response;
    try { upstream = await fetcher(new Request(current, { method: "GET", headers, redirect: "manual" })); }
    catch { return reject(502); }
    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      const location = upstream.headers.get("location");
      await upstream.body?.cancel();
      if (!location || redirects === 3) return reject(502);
      const next = safeTarget(new URL(location, current).toString());
      if (!next || next.hostname !== expectedHost) return reject(502);
      current = next;
      continue;
    }
    const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_RESPONSE_BYTES) { await upstream.body?.cancel(); return reject(502); }
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) return reject(502);
    const responseHeaders = new Headers({ "cache-control": "private, no-store", "x-np-relay-final-url": current.toString() });
    for (const name of ["content-type", "etag", "last-modified", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(bytes, { status: upstream.status, headers: responseHeaders });
  }
  return reject(502);
}
