import { z } from "zod";
import { triggerRevalidate } from "@newspoint/content";
import { pollsReady, listPolls, pollDetails, savePoll, correctPoll, PollError } from "@newspoint/db/polls";
import { pollInput, pollCorrection } from "@newspoint/db/poll-types";
import { staffFromRequest } from "@/lib/session";
import { studioOrigins } from "@/lib/auth";

export const dynamic = "force-dynamic";
const mutation = z.discriminatedUnion("action", [z.object({action:z.literal("save"),input:pollInput}).strict(),z.object({action:z.literal("correct"),input:pollCorrection}).strict()]);
function json(data: unknown,status=200) { return Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}}); }
function failure(e: unknown) {
  if (e instanceof PollError) return json({error:{code:e.code,message:e.message}},e.status);
  if (e instanceof z.ZodError) return json({error:{code:"validation",message:e.issues.map(i=>i.message).join(" ")}},400);
  console.error("[studio-polls]",e instanceof Error ? e.message : "unknown");
  return json({error:{code:"unavailable",message:"Анкетите временно не са достъпни."}},503);
}
async function ready() { if (!await pollsReady()) throw new PollError(503,"migration","Първо приложете миграция 16_polls.sql."); }
export async function GET(request: Request) {
  if (!await staffFromRequest(request)) return json({error:{message:"Влезте отново."}},401);
  try {
    await ready(); const url = new URL(request.url); const id=url.searchParams.get("id");
    const page=z.coerce.number().int().min(0).max(100000).parse(url.searchParams.get("page") ?? 0);
    return json(id ? await pollDetails(z.uuid().parse(id),page) : await listPolls(page));
  } catch(e) { return failure(e); }
}
export async function POST(request: Request) {
  if (!studioOrigins().trusted.includes(request.headers.get("origin") ?? "")) return json({error:{message:"Заявката трябва да идва от Studio."}},403);
  const staff = await staffFromRequest(request);
  if (!staff) return json({error:{message:"Влезте отново."}},401);
  try {
    if (!request.body || !/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw new PollError(400,"body","Невалидна заявка.");
    const reader=request.body.getReader(); const chunks:Uint8Array[]=[]; let bytes=0; let expired=false;
    const timeout=setTimeout(()=>{expired=true;void reader.cancel();},10000);
    try { while(true) { const part=await reader.read(); if(expired) throw new PollError(408,"timeout","Заявката отне твърде дълго."); if(part.done) break; bytes+=part.value.byteLength; if(bytes>16384) {await reader.cancel();throw new PollError(413,"size","Твърде голяма заявка.");} chunks.push(part.value); } }
    finally { clearTimeout(timeout);reader.releaseLock(); }
    let value:unknown; try {value=JSON.parse(Buffer.concat(chunks).toString("utf8"));} catch {throw new PollError(400,"json","Невалидни данни.");}
    const data=mutation.parse(value); await ready();
    const poll=data.action === "save" ? await savePoll(data.input,staff) : await correctPoll(data.input,staff);
    const revalidateResult = await triggerRevalidate(["/"]);
    return json({poll,refreshed: revalidateResult.reason === "ok"});
  } catch(e) { return failure(e); }
}
