import { lookup } from "node:dns/promises";
import type {LookupAddress} from "node:dns";
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
function sourceAbort(signal:AbortSignal):Error {
  return signal.reason instanceof Error ? signal.reason : new Error("source_aborted");
}
/** DNS has no native cancellation; stop waiting and never start a late request. */
async function sourceLookup(hostname:string,signal:AbortSignal){
  if(signal.aborted)throw sourceAbort(signal);
  return new Promise<LookupAddress[]>((resolve,reject)=>{
    const abort=()=>{cleanup();reject(sourceAbort(signal));};
    const cleanup=()=>signal.removeEventListener("abort",abort);
    signal.addEventListener("abort",abort,{once:true});
    lookup(hostname,{all:true}).then(result=>{cleanup();if(signal.aborted)reject(sourceAbort(signal));else resolve(result);},error=>{cleanup();reject(error);});
  });
}
async function fetchSmartPageStep(raw:string,redirects:number,signal:AbortSignal):Promise<{url:string;text:string}>{
  if(signal.aborted)throw sourceAbort(signal);
  if (redirects > 2) throw new Error("redirect_limit");
  const url = smartWebUrl(raw);
  const resolved = await sourceLookup(url.hostname,signal);
  if(signal.aborted)throw sourceAbort(signal);
  if (!resolved.length || resolved.some(x => !publicSmartAddress(x.address))) throw new Error("private_address");
  const target = resolved[0]!;
  const result = await new Promise<{ location?: string; body?: string }>((resolve, reject) => {
    let settled=false;
    const finish=(error:Error|null,result?:{location?:string;body?:string})=>{
      if(settled)return;settled=true;signal.removeEventListener("abort",abort);
      if(error)reject(error);else resolve(result!);
    };
    const abort=()=>{const error=sourceAbort(signal);finish(error);req.destroy(error);};
    const req = request(url, { method: "GET", family:target.family,headers: { "User-Agent": "NewsPointSmart/1.0 (+https://newspoint.bg)", "Accept": "text/html,text/plain" },
      lookup: (_host, _options, done) => done(null, target.address, target.family) }, res => {
      if(settled){res.resume();return;}
      if (res.statusCode && [301,302,303,307,308].includes(res.statusCode)) { finish(null,{location:res.headers.location??""});req.destroy();return; }
      if (res.statusCode !== 200 || !/^(text\/html|text\/plain)/i.test(res.headers["content-type"] ?? "")) { finish(new Error("unreadable_source"));req.destroy();return; }
      let size = 0; const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => { if(settled)return;size += chunk.length; if (size > 2_000_000) { const error=new Error("source_size");finish(error);req.destroy(error); } else chunks.push(chunk); });
      res.on("end", () => finish(null,{ body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error",error=>finish(error));
      res.on("aborted",()=>finish(new Error("source_incomplete")));
    });
    // Retain the request's error handler through destroy: its error event may be
    // emitted after abort has already rejected the promise.
    req.on("error",error=>finish(error));
    signal.addEventListener("abort",abort,{once:true});
    if(signal.aborted)abort();else req.end();
  });
  if(signal.aborted)throw sourceAbort(signal);
  if (result.location) return fetchSmartPageStep(new URL(result.location, url).href, redirects + 1,signal);
  const text = plainSmartHtml(result.body ?? "");
  if (text.length < 100) throw new Error("empty_source");
  return { url: url.href, text: text.slice(0, 20_000) };
}
/** One wall-clock deadline covers DNS, redirects and the entire response body.
 * DNS is checked and pinned for every TLS request; aborted/partial bodies are
 * never evidence. Optional cancellation lets a bounded research batch stop
 * downloading lower-priority pages once it has its selected sources. */
export async function fetchSmartPage(raw:string,redirects=0,signal?:AbortSignal):Promise<{url:string;text:string}>{
  if(signal?.aborted)throw new Error("source_aborted");
  const controller=new AbortController();
  const abort=()=>controller.abort(new Error("source_aborted"));
  signal?.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error("source_timeout")),8000);
  try{return await fetchSmartPageStep(raw,redirects,controller.signal);}
  finally{clearTimeout(timer);signal?.removeEventListener("abort",abort);}
}
