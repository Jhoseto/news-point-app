import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb, loadRootEnv } from "@newspoint/db";
import { SmartError, smartReady, smartRateLimit, readSmartBootstrap, openSmartSession, readSmartSession, reserveSmartTurn, deleteSmartSession } from "@newspoint/db/smart";
import { smartConfig } from "@newspoint/db/smart-provider";

const COOKIE="np_smart";
const headers={"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff"};
const id=z.uuid();
const ask=z.object({sessionId:id,requestKey:id,question:z.string().trim().min(3).max(600),questionId:z.string().max(160).optional(),parentKey:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
function signature(secret:string,value:string){return createHmac("sha256",secret).update(`smart:v1:${value}`).digest("hex");}
export function smartOwner(secret:string,cookie:string|undefined){
  if(!cookie||!/^\d{10}\.[a-f0-9]{48}\.[a-f0-9]{64}$/.test(cookie))return null;
  const [time,nonce,sig]=cookie.split(".");const age=Date.now()/1000-Number(time);
  if(age< -60||age>30*86400)return null;
  const expected=signature(secret,`${time}.${nonce}`);
  if(!timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(sig!,"hex")))return null;
  return signature(secret,`owner:${nonce}`);
}
async function boundedJson(request:Request){
  if(!/^application\/json(?:;|$)/i.test(request.headers.get("content-type")??"")||!request.body)throw new SmartError("input",400,"Невалиден въпрос.");
  const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  const timer=setTimeout(()=>void reader.cancel(),5000);
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader.cancel();throw new SmartError("size",413,"Въпросът е твърде дълъг.");}chunks.push(part.value);}return JSON.parse(Buffer.concat(chunks).toString("utf8"));}
  finally{clearTimeout(timer);reader.releaseLock();}
}
export async function smartApi(request:NextRequest,action:"bootstrap"|"session"|"ask"|"history"|"feedback",rawId:string){
  try{
    loadRootEnv();const config=smartConfig();
    if(!config.enabled)throw new SmartError("disabled",503,"NewsPoint Smart още не е активен.");
    if(config.secret.length<32)throw new SmartError("config",503,"NewsPoint Smart очаква конфигурация.");
    const resource=id.parse(rawId);const db=getDb();
    if(!await smartReady(db))throw new SmartError("migration",503,"NewsPoint Smart се подготвя.");
    const owner=smartOwner(config.secret,request.cookies.get(COOKIE)?.value);
    if(request.method!=="GET"){
      if(request.headers.get("origin")!==config.origin||request.headers.get("sec-fetch-site")==="cross-site")throw new SmartError("origin",403,"Използвай Smart през сайта на NewsPoint.");
      if(owner)await smartRateLimit(db,`mutate:${owner}`,30,60);
    }
    if(action==="bootstrap"){
      // This GET may enqueue paid preparation, so cross-site requests and anonymous floods are bounded too.
      if(request.headers.get("sec-fetch-site")==="cross-site")throw new SmartError("origin",403,"Използвай Smart през сайта на NewsPoint.");
      const peerHeader=process.env.SMART_TRUSTED_IP_HEADER;
      const peer=peerHeader?request.headers.get(peerHeader):process.env.NODE_ENV!=="production"?"local":null;
      if(!peer||peer.length>80||peer.includes(","))throw new SmartError("ingress",503,"Smart очаква защитена връзка.");
      await smartRateLimit(db,signature(config.secret,`bootstrap:${peer}`),120,60);
      return NextResponse.json(await readSmartBootstrap(db,resource),{headers});
    }
    if(action==="session"){
      if(request.method==="GET"){
        if(!owner)return NextResponse.json(null,{headers});
        const rows=await db.execute(sql`select id from smart_sessions where article_id=${resource}::uuid and owner_hash=${owner} and deleted_at is null and expires_at>now()`);
        return NextResponse.json(rows[0]?await readSmartSession(db,String(rows[0].id),owner):null,{headers});
      }
      // Signed identities are not people; use trusted ingress only for cookie-creation abuse controls.
      const ipHeader=process.env.SMART_TRUSTED_IP_HEADER;
      const peer=ipHeader?request.headers.get(ipHeader):process.env.NODE_ENV!=="production"?"local":null;
      if(!peer||peer.length>80||peer.includes(","))throw new SmartError("ingress",503,"Smart очаква защитена връзка.");
      await smartRateLimit(db,signature(config.secret,`ip:${peer}`),15,3600);
      const token=owner?null:`${Math.floor(Date.now()/1000)}.${randomBytes(24).toString("hex")}`;
      const cookie=token?`${token}.${signature(config.secret,token)}`:null;
      const identity=owner??smartOwner(config.secret,cookie!)!;
      const sessionId=await openSmartSession(db,resource,identity);
      const response=NextResponse.json(await readSmartSession(db,sessionId,identity),{headers});
      if(cookie)response.cookies.set(COOKIE,cookie,{httpOnly:true,secure:config.origin.startsWith("https:"),sameSite:"lax",path:"/",maxAge:30*86400});
      return response;
    }
    if(!owner)throw new SmartError("session",404,"Сесията не е достъпна.");
    if(action==="ask"){
      const input=ask.parse(await boundedJson(request));
      const session=await readSmartSession(db,input.sessionId,owner);
      if(session.articleId!==resource)throw new SmartError("session",404,"Сесията не е достъпна.");
      await reserveSmartTurn(db,owner,input);
      return NextResponse.json(await readSmartSession(db,input.sessionId,owner),{status:202,headers});
    }
    if(action==="feedback"){
      const input=z.object({turnId:id,useful:z.boolean()}).strict().parse(await boundedJson(request));
      const session=await readSmartSession(db,resource,owner);
      if(!session.turns.some(t=>t.id===input.turnId&&t.status==="completed"))throw new SmartError("turn",404,"Отговорът не е достъпен.");
      await db.execute(sql`insert into smart_feedback(session_id,turn_id,useful) values(${resource}::uuid,${input.turnId}::uuid,${input.useful}) on conflict(session_id,turn_id) do update set useful=excluded.useful`);
      return NextResponse.json({ok:true},{headers});
    }
    if(request.method==="DELETE"){await deleteSmartSession(db,resource,owner);return NextResponse.json({ok:true},{headers});}
    return NextResponse.json(await readSmartSession(db,resource,owner),{headers});
  }catch(error){
    if(error instanceof SmartError)return NextResponse.json({error:error.message,code:error.code},{status:error.status,headers});
    if(error instanceof z.ZodError||error instanceof SyntaxError)return NextResponse.json({error:"Невалидна заявка.",code:"input"},{status:400,headers});
    return NextResponse.json({error:"NewsPoint Smart временно не е достъпен.",code:"unavailable"},{status:503,headers});
  }
}
