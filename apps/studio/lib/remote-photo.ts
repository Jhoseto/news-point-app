import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";

const blocked = new BlockList();
for (const [address, prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",3]] as const) blocked.addSubnet(address,prefix,"ipv4");
const globalV6 = new BlockList(); globalV6.addSubnet("2000::",3,"ipv6");
blocked.addSubnet("2001::",23,"ipv6"); blocked.addSubnet("2001:db8::",32,"ipv6"); blocked.addSubnet("2002::",16,"ipv6"); blocked.addSubnet("3fff::",20,"ipv6");
export function publicPhotoAddress(address: string): boolean {
  const family=isIP(address);
  return family===4 ? !blocked.check(address,"ipv4") : family===6 && globalV6.check(address,"ipv6") && !blocked.check(address,"ipv6");
}
export function photoSourceUrl(value: string): URL {
  const url=new URL(value);
  if(value.length>4096 || !["http:","https:"].includes(url.protocol) || url.username || url.password || url.port || url.hostname.endsWith(".") || !url.hostname.includes(".") || isIP(url.hostname.replace(/^\[|\]$/g,""))) throw Error("Invalid photo address");
  return url;
}
/** Pin DNS at the socket, check every redirect, never forward Studio credentials. */
export async function downloadRemotePhoto(value: string, maxBytes: number): Promise<{ bytes: Buffer; type: string }> {
  const signal=AbortSignal.timeout(20_000);
  let url=photoSourceUrl(value);
  for(let hop=0;hop<4;hop++){
    signal.throwIfAborted();
    const addresses=await Promise.race([lookup(url.hostname,{all:true}),new Promise<never>((_resolve,reject)=>signal.addEventListener("abort",()=>reject(Error("Photo timed out")),{once:true}))]);
    signal.throwIfAborted();
    if(!addresses.length || addresses.some(item=>!publicPhotoAddress(item.address))) throw Error("Blocked photo address");
    const target=addresses[0]!;
    const result=await new Promise<{ redirect: string } | { bytes: Buffer; type: string }>((resolve,reject)=>{
      const request=(url.protocol==="https:"?httpsGet:httpGet)(url,{
        agent:false, signal, family:target.family,
        lookup:(_host,options,callback)=>{ if(options.all) callback(null,[target]); else callback(null,target.address,target.family); },
        headers:{accept:"image/avif,image/webp,image/png,image/jpeg,image/gif", "user-agent":"NewsPoint image import", "accept-encoding":"identity"},
      },response=>{
        if([301,302,303,307,308].includes(response.statusCode??0) && response.headers.location){response.destroy();resolve({redirect:response.headers.location});return;}
        const type=(response.headers["content-type"]??"").split(";")[0]!.trim().toLowerCase();
        if(response.statusCode!==200 || !["image/jpeg","image/png","image/webp","image/gif","image/avif"].includes(type) || Number(response.headers["content-length"]??0)>maxBytes){response.destroy();reject(Error("Invalid remote photo"));return;}
        const chunks:Buffer[]=[];let size=0;
        response.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>maxBytes){response.destroy(Error("Photo too large"));return;}chunks.push(chunk);});
        response.on("error",reject);response.on("aborted",()=>reject(Error("Photo interrupted")));response.on("end",()=>size?resolve({bytes:Buffer.concat(chunks),type}):reject(Error("Empty photo")));
      });
      request.on("error",reject);
    });
    if("bytes" in result)return result;
    url=photoSourceUrl(new URL(result.redirect,url).href);
  }
  throw Error("Too many photo redirects");
}
