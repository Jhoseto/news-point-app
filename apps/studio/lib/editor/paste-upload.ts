import type { MediaOption } from "../articles";
import { withBase } from "../paths";
import type { PastedImage } from "./paste-images";

export async function uploadPastedImage({source,alt}: PastedImage): Promise<MediaOption> {
  let body: FormData | string;let headers: Record<string,string> | undefined;
  if (typeof source === "string" && source.startsWith("data:")) {
    const match=/^data:(image\/(?:png|jpeg|webp|gif|avif));base64,([a-z0-9+/=\r\n]+)$/i.exec(source);
    if (!match || match[2]!.length > 35_000_000) throw Error("Неподдържана снимка.");
    const raw=atob(match[2]!);source=new File([Uint8Array.from(raw,char=>char.charCodeAt(0))],"pasted-photo",{type:match[1]!.toLowerCase()});
  }
  if (typeof source === "string") {
    if (!/^https?:\/\//i.test(source)) throw Error("Невалиден адрес на снимка.");
    body=JSON.stringify({url:source,alt});headers={"content-type":"application/json"};
  } else {
    if (source.size > 25 * 1024 * 1024) throw Error("Снимката трябва да е до 25 MB.");
    body=new FormData();body.set("file",source);body.set("alt",alt);
  }
  const response=await fetch(withBase("/api/editor/media/upload/"),{method:"POST",body,...(headers ? {headers} : {}),signal:AbortSignal.timeout(60_000)});
  const payload=await response.json().catch(()=>null);
  if(!response.ok || !payload?.id || !payload?.url) throw Error(payload?.error?.message || "Снимката не беше добавена.");
  return payload as MediaOption;
}
