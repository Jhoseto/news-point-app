import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import { plainSmartHtml } from "@newspoint/content/smart-text";

export function publicSmartAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split(".").map(Number) as [number,number,number];
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0,168].includes(b)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18,19].includes(b)) || (a===198&&b===51&&c===100) || (a===203&&b===0&&c===113));
  }
  // Only globally routable native IPv6; reject mapped IPv4, local and multicast.
  if(isIP(address)!==6)return false;
  const normalized=new URL(`https://[${address}]/`).hostname.slice(1,-1);
  const [first,second]=normalized.split(":");
  const prefix=parseInt(first!,16),subnet=parseInt(second||"0",16);
  return /^[23][0-9a-f]{3}:/i.test(normalized) && prefix!==0x2002 && prefix!==0x3fff
    && !(prefix===0x2001&&(subnet<=0x1ff||subnet===0xdb8));
}
export function smartWebUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !url.hostname.includes(".") || /\.(local|internal|localhost|test|invalid)$/i.test(url.hostname) || (isIP(url.hostname) && !publicSmartAddress(url.hostname))) throw new Error("unsafe_url");
  url.hash = "";
  return url;
}
/** DNS is checked and pinned for the TLS request, including every redirect. */
export async function fetchSmartPage(raw: string, redirects = 0): Promise<{ url: string; text: string }> {
  if (redirects > 2) throw new Error("redirect_limit");
  const url = smartWebUrl(raw);
  const resolved = await lookup(url.hostname, { all: true });
  if (!resolved.length || resolved.some(x => !publicSmartAddress(x.address))) throw new Error("private_address");
  const target = resolved[0]!;
  const result = await new Promise<{ location?: string; body?: string }>((resolve, reject) => {
    const req = request(url, { method: "GET", family:target.family,headers: { "User-Agent": "NewsPointSmart/1.0 (+https://newspoint.bg)", "Accept": "text/html,text/plain" },
      lookup: (_host, _options, done) => done(null, target.address, target.family), timeout: 8000 }, res => {
      if (res.statusCode && [301,302,303,307,308].includes(res.statusCode)) { res.resume(); resolve({ location: res.headers.location ?? "" }); return; }
      if (res.statusCode !== 200 || !/^(text\/html|text\/plain)/i.test(res.headers["content-type"] ?? "")) { res.resume(); reject(new Error("unreadable_source")); return; }
      let size = 0; const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 2_000_000) { const error=new Error("source_size");reject(error);req.destroy(error); } else chunks.push(chunk); });
      res.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("source_timeout"))); req.on("error", reject); req.end();
  });
  if (result.location) return fetchSmartPage(new URL(result.location, url).href, redirects + 1);
  const text = plainSmartHtml(result.body ?? "");
  if (text.length < 100) throw new Error("empty_source");
  return { url: url.href, text: text.slice(0, 20_000) };
}
