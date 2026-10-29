import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { acquireSmartNode, deleteSmartSession, finishSmartNode, finishSmartTurn, openSmartSession, pruneSmartPrivateData, readSmartSession, reserveSmartTurn, smartArticle, smartNodeKey, type SmartDb } from "./smart";
import { costFilters, parseOpenAiUsage, readAiCosts, settleAiOperation, startAiOperation } from "./ai-usage";
import type { SmartAnswer } from "@newspoint/content/smart";
import { answerSmartQuestion,askSmart,smartOwnedResearchSource } from "./smart-service";
import { smartConfig,smartJson } from "./smart-provider";
import {z} from "zod";
import {packSmartVector,searchSmartVectors,unpackSmartVector} from "./smart-vector";

let pg:PGlite, db:SmartDb;
type RawDb=Pick<ReturnType<typeof drizzle>,"execute"|"transaction">;
function adapt(raw:RawDb):SmartDb {
  return {execute:async(q:SQL)=>{
    // The production postgres-js raw SQL path requires explicit ISO timestamps.
    if(new PgDialect().sqlToQuery(q).params.some(value=>value instanceof Date))throw new Error("Raw Date parameter: use an ISO timestamp");
    return (await raw.execute(q)).rows;
  },
    transaction:<T>(fn:(tx:SmartDb)=>Promise<T>)=>raw.transaction(tx=>fn(adapt(tx)))} as unknown as SmartDb;
}
const articleId=randomUUID();
beforeAll(async()=>{
  pg=new PGlite(); db=adapt(drizzle(pg));
  await pg.exec(`create table articles(id uuid primary key,title text,excerpt text,body jsonb,path text,published_revision integer,source_modified_at timestamptz,is_public boolean,published_at timestamptz,updated_at timestamptz);
    insert into articles values('${articleId}','Explicit QA fixture','QA fixture','[]','/qa-fixture/',1,null,true,now()-interval '1 day',now());
    create table story_themes(id uuid primary key,is_published boolean,published_at timestamptz);
    create table story_theme_articles(theme_id uuid,article_id uuid);`);
  await pg.exec(readFileSync(new URL("../migrations/44_smart.sql",import.meta.url),"utf8"));
  await pg.exec(readFileSync(new URL("../migrations/45_smart_semantic.sql",import.meta.url),"utf8"));
});
afterAll(async()=>{await pg.close();});
const answer:SmartAnswer={status:"insufficient",blocks:[{text:"Explicit QA fixture: insufficient evidence",sourceIds:[]}],sources:[],followUps:[],checkedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
describe("Smart PostgreSQL invariants",()=>{
  it("does not reintroduce old or private own coverage through external search URLs",async()=>{
    const config=smartConfig({}),current=await smartArticle(db,articleId),oldId=randomUUID(),privateId=randomUUID();
    await db.execute(sql`insert into articles select ${oldId}::uuid,title,excerpt,body,'/old-owned-qa/',published_revision,source_modified_at,true,now()-interval '7 months',updated_at from articles where id=${articleId}::uuid`);
    await db.execute(sql`insert into articles select ${privateId}::uuid,title,excerpt,body,'/private-owned-qa/',published_revision,source_modified_at,false,published_at,updated_at from articles where id=${articleId}::uuid`);
    expect(await smartOwnedResearchSource(db,config,current,'https://newspoint.bg/old-owned-qa/')).toBeNull();
    expect(await smartOwnedResearchSource(db,config,current,'https://newspoint.bg/private-owned-qa/')).toBeNull();
    expect(await smartOwnedResearchSource(db,config,current,'https://example.org/news/')).toBeUndefined();
    expect((await smartOwnedResearchSource(db,config,current,'https://www.newspoint.bg/qa-fixture/'))?.kind).toBe('current');
    expect((await smartOwnedResearchSource(db,config,await smartArticle(db,oldId),'https://newspoint.bg/old-owned-qa/'))?.kind).toBe('current');
    await db.execute(sql`delete from articles where id in (${oldId}::uuid,${privateId}::uuid)`);
  });
  it("uses the same semantic vectors without PostgreSQL extensions and excludes older, future and private articles",async()=>{
    const first=Array(1536).fill(0) as number[],second=[...first];first[0]=1;second[1]=1;
    expect(unpackSmartVector(packSmartVector(first))[0]).toBe(1);
    const ids:string[]=[];
    for(const [age,visible,vector] of [["1 day",true,first],["2 days",true,second],["7 months",true,first],["-1 day",true,first],["1 day",false,first]] as const){
      const id=randomUUID();ids.push(id);
      await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,body,path,published_revision,source_modified_at,${visible},now()-${age}::interval,updated_at from articles where id=${articleId}::uuid`);
      const revision=(await db.execute(sql`select md5(title||excerpt||body::text||coalesce(published_revision::text,'')||coalesce(extract(epoch from source_modified_at)::text,'')) as revision from articles where id=${id}::uuid`))[0]!.revision;
      await db.execute(sql`insert into smart_documents(article_id,revision,chunk,text,embedding) values(${id}::uuid,${revision},0,'Explicit semantic QA fixture',decode(${packSmartVector(vector).toString("hex")},'hex'))`);
    }
    const result=await searchSmartVectors(db,first,articleId);
    expect(result.map(x=>x.article_id)).toEqual(ids.slice(0,2));
    await db.execute(sql`update articles set is_public=false where id=${ids[0]!}::uuid`);
    expect((await searchSmartVectors(db,first,articleId)).map(x=>x.article_id)).toEqual([ids[1]]);
    for(const id of ids)await db.execute(sql`delete from articles where id=${id}::uuid`);
  });
  it("applies the migration and reuses the same anonymous article session",async()=>{
    const id=await openSmartSession(db,articleId,"reader-a");
    expect(await openSmartSession(db,articleId,"reader-a")).toBe(id);
    await expect(readSmartSession(db,id,"reader-b")).rejects.toMatchObject({status:404});
  });
  it("counts five answers once each and rejects the sixth",async()=>{
    const id=await openSmartSession(db,articleId,"limit-reader");
    for(let i=0;i<5;i++){
      const input={sessionId:id,requestKey:randomUUID(),question:`QA fixture question ${i}`};
      const turn=await reserveSmartTurn(db,"limit-reader",input);
      expect((await reserveSmartTurn(db,"limit-reader",input)).id).toBe(turn.id);
      await finishSmartTurn(db,String(turn.id),answer,false,null);
      await finishSmartTurn(db,String(turn.id),answer,false,null);
    }
    expect((await readSmartSession(db,id,"limit-reader")).usedQuestions).toBe(5);
    await expect(reserveSmartTurn(db,"limit-reader",{sessionId:id,requestKey:randomUUID(),question:"Sixth QA fixture"})).rejects.toMatchObject({code:"question_limit"});
  });
  it("does not allow a second pending turn or key reuse for another question",async()=>{
    const id=await openSmartSession(db,articleId,"busy-reader");const key=randomUUID();
    await reserveSmartTurn(db,"busy-reader",{sessionId:id,requestKey:key,question:"First QA fixture"});
    await expect(reserveSmartTurn(db,"busy-reader",{sessionId:id,requestKey:key,question:"Different QA fixture"})).rejects.toMatchObject({code:"idempotency"});
    await expect(reserveSmartTurn(db,"busy-reader",{sessionId:id,requestKey:randomUUID(),question:"Second QA fixture"})).rejects.toMatchObject({code:"busy"});
  });
  it("deletion removes the transcript but preserves the quota tombstone",async()=>{
    const id=await openSmartSession(db,articleId,"delete-reader");
    const turn=await reserveSmartTurn(db,"delete-reader",{sessionId:id,requestKey:randomUUID(),question:"QA fixture"});await finishSmartTurn(db,String(turn.id),answer,false,null);
    await deleteSmartSession(db,id,"delete-reader");
    await expect(openSmartSession(db,articleId,"delete-reader")).rejects.toMatchObject({code:"deleted"});
    expect((await db.execute(sql`select used from smart_sessions where id=${id}::uuid`))[0]?.used).toBe(1);
    expect((await db.execute(sql`select count(*)::int as n from smart_turns where session_id=${id}::uuid`))[0]?.n).toBe(0);
  });
  it("coalesces shared nodes and returns a valid cached answer without regeneration",async()=>{
    const article=await smartArticle(db,articleId),key=smartNodeKey(article,"qa-question",null,"qa-generation");
    const claim=await acquireSmartNode(db,key,article,"qa-question","QA fixture",null);
    expect(claim.acquired).toBe(true);
    await expect(acquireSmartNode(db,key,article,"qa-question","QA fixture",null)).rejects.toMatchObject({code:"preparing"});
    await finishSmartNode(db,key,claim.token!,answer);
    const cached=await acquireSmartNode(db,key,article,"qa-question","QA fixture",null);
    expect(cached.acquired).toBe(false);expect(cached.answer).toEqual(answer);
    expect(smartNodeKey({...article,revision:"changed"},"qa-question",null,"qa-generation")).not.toBe(key);
  });
  it("meters actual attempts and does not count duplicate settlement twice",async()=>{
    const id=await startAiOperation(db,{module:"smart",provider:"openai",articleId,title:"QA fixture",model:"gpt-6.1-sol",operation:"answer",environment:"test"});
    const usage={input:8000,cachedInput:0,cacheWrite:0,output:2000,reasoning:1000,searches:1};
    await settleAiOperation(db,id,"gpt-6.1-sol",usage,"qa-response",null);
    await settleAiOperation(db,id,"gpt-6.1-sol",usage,"qa-response",null);
    const report=await readAiCosts(db,{start:new Date(Date.now()-86400_000),end:new Date(Date.now()+60000),module:"smart",article:articleId,environment:"test",page:1});
    expect(report.totals?.calls).toBe(1);expect(Number(report.totals?.amount)).toBe(.046);
    expect(Number(report.articles[0]?.amount)).toBe(.046);
  });
  it("unknown usage remains unknown rather than zero",async()=>{
    expect(parseOpenAiUsage({})).toBeNull();
    const id=await startAiOperation(db,{module:"smart",provider:"openai",articleId,model:"gpt-6.1-sol",operation:"unknown",environment:"test"});
    await settleAiOperation(db,id,"gpt-6.1-sol",null,null,null);
    const rows=await db.execute(sql`select status,amount_usd from ai_operations where id=${id}::uuid`);
    expect(rows[0]).toMatchObject({status:"unknown",amount_usd:null});
  });
  it("does not turn unknown-only article totals into zero dollars",async()=>{
    const id=randomUUID();await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,body,'/unknown-only-qa/',published_revision,source_modified_at,is_public,published_at,updated_at from articles where id=${articleId}::uuid`);
    const op=await startAiOperation(db,{module:"smart",provider:"openai",articleId:id,model:"gpt-6.1-sol",operation:"unknown_qa",environment:"test"});
    await settleAiOperation(db,op,"gpt-6.1-sol",null,null,null);
    const report=await readAiCosts(db,{start:new Date('1970-01-01'),end:new Date(Date.now()+60000),module:"smart",article:id,environment:"test",page:1});
    expect(report.totals?.amount).toBeNull();expect(report.articles[0]?.amount).toBeNull();expect(report.articles[0]?.lifetimeAmount).toBeNull();expect(report.modules[0]?.amount).toBeNull();expect(report.daily[0]?.amount).toBeNull();
    await db.execute(sql`delete from articles where id=${id}::uuid`);
  });
  it("serves the same public question to two readers with zero provider requests",async()=>{
    const article=await smartArticle(db,articleId),questionId=randomUUID(),question="Explicit cached QA question";
    await db.execute(sql`insert into smart_bootstraps(article_id,revision,payload,sources,state,expires_at)
      values(${articleId}::uuid,${article.revision},${JSON.stringify({questions:[{id:questionId,text:question}]})}::jsonb,'[]','ready',now()+interval '1 hour')`);
    const rows=await db.execute(sql`select updated_at from smart_bootstraps where article_id=${articleId}::uuid`);
    const config=smartConfig({}),key=smartNodeKey(article,questionId,null,`${new Date(rows[0]!.updated_at as string).toISOString()}:${config.model}`);
    const node=await acquireSmartNode(db,key,article,questionId,question,null);await finishSmartNode(db,key,node.token!,answer);
    const network=vi.fn(()=>{throw new Error("A cache hit must not access the provider");});vi.stubGlobal("fetch",network);
    try{
      for(const owner of ["cached-reader-1","cached-reader-2"]){
        const sessionId=await openSmartSession(db,articleId,owner);
        const result=await askSmart(db,config,owner,{sessionId,requestKey:randomUUID(),questionId,question},true);
        expect(result).not.toBeNull();
        expect(result!.usedQuestions).toBe(1);expect(result!.turns[0]?.cached).toBe(true);
      }
      expect(network).not.toHaveBeenCalled();
      const privateSession=await openSmartSession(db,articleId,"cache-miss-reader");
      expect(await askSmart(db,config,"cache-miss-reader",{sessionId:privateSession,requestKey:randomUUID(),question:"Explicit private QA"},true)).toBeNull();
      expect((await readSmartSession(db,privateSession,"cache-miss-reader")).turns).toHaveLength(0);
    }finally{vi.unstubAllGlobals();}
  });
  it("preserves attributed spend after an article is deleted",async()=>{
    const deletedId=randomUUID();
    await db.execute(sql`insert into articles select ${deletedId}::uuid,title,excerpt,body,path,published_revision,source_modified_at,is_public,published_at,updated_at from articles where id=${articleId}::uuid`);
    const op=await startAiOperation(db,{module:"smart",provider:"openai",articleId:deletedId,title:"Deleted QA fixture",model:"gpt-6.1-sol",operation:"answer",environment:"test"});
    await settleAiOperation(db,op,"gpt-6.1-sol",{input:1000,cachedInput:0,cacheWrite:0,output:100,reasoning:0,searches:0},null,null);
    await db.execute(sql`delete from articles where id=${deletedId}::uuid`);
    const report=await readAiCosts(db,{start:new Date(Date.now()-86400_000),end:new Date(Date.now()+60000),module:"smart",article:deletedId,environment:"test",page:1});
    expect(report.articles[0]).toMatchObject({id:deletedId,deleted:true});expect(Number(report.totals?.amount)).toBe(.003);
  });
  it("compares provider totals with the same project and UTC buckets",async()=>{
    const op=await startAiOperation(db,{module:"smart",provider:"openai",projectId:"qa-project",articleId,title:"Literal %_ QA title",model:"gpt-6.1-sol",operation:"answer",environment:"test"});
    await settleAiOperation(db,op,"gpt-6.1-sol",{input:1000,cachedInput:0,cacheWrite:0,output:100,reasoning:0,searches:0},null,null);
    await db.execute(sql`insert into ai_provider_costs values('openai','qa-project',date_trunc('day',now()),date_trunc('day',now())+interval '1 day','qa','usd',0.005,now())`);
    const filters=costFilters(new URLSearchParams({start:"1970-01-01",end:new Date(Date.now()+2*86400_000).toISOString(),q:"%_",environment:"test"}));
    const report=await readAiCosts(db,filters);
    // Search returns every operation for the matching article, even its earlier titles.
    expect(report.totals?.calls).toBe(3);expect(Number(report.totals?.amount)).toBe(.049);
    expect(Number(report.provider[0]?.localAmount)).toBe(.003);expect(Number(report.provider[0]?.difference)).toBe(.002);
  });
  it("prunes expired private transcripts without removing financial history",async()=>{
    const id=await openSmartSession(db,articleId,"retention-qa");
    const turn=await reserveSmartTurn(db,"retention-qa",{sessionId:id,requestKey:randomUUID(),question:"Explicit retention QA"});await finishSmartTurn(db,String(turn.id),answer,false,null);
    await db.execute(sql`update smart_sessions set expires_at=now()-interval '8 days' where id=${id}::uuid`);
    const before=await db.execute(sql`select count(*)::int as n from ai_operations`);
    await pruneSmartPrivateData(db);
    expect((await db.execute(sql`select count(*)::int as n from smart_turns where session_id=${id}::uuid`))[0]?.n).toBe(0);
    expect((await db.execute(sql`select count(*)::int as n from ai_operations`))[0]?.n).toBe(before[0]?.n);
  });
  it("meters a bounded retry after a known incomplete response",async()=>{
    const config=smartConfig({OPENAI_API_KEY:"explicit-qa-key-not-real"}),article=await smartArticle(db,articleId);
    const network=vi.fn().mockResolvedValueOnce(Response.json({id:randomUUID(),model:config.model,status:"incomplete",incomplete_details:{reason:"max_output_tokens"},usage:{input_tokens:10,output_tokens:7000},output:[]}))
      .mockResolvedValueOnce(Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{content:[{type:"output_text",text:'{"value":"QA fixture"}'}]}]}));
    vi.stubGlobal("fetch",network);
    try{
      expect(await smartJson(db,config,article,"assessment","QA fixture",{},z.object({value:z.string()}))).toEqual({value:"QA fixture"});
      expect(network).toHaveBeenCalledTimes(2);
      const payload=JSON.parse(network.mock.calls[1]![1].body as string);expect(payload.max_output_tokens).toBe(12000);
      const rows=await db.execute(sql`select status,error_code from ai_operations where error_code='incomplete_max_output_tokens'`);
      expect(rows[0]).toMatchObject({status:"known",error_code:"incomplete_max_output_tokens"});
    }finally{vi.unstubAllGlobals();}
  });
  it("does not silently repeat a provider request with unknown consumption",async()=>{
    const network=vi.fn().mockRejectedValue(new Error("Explicit QA timeout"));vi.stubGlobal("fetch",network);
    try{
      await expect(smartJson(db,smartConfig({OPENAI_API_KEY:"explicit-qa-key-not-real"}),await smartArticle(db,articleId),"assessment","QA",{},z.object({value:z.string()}))).rejects.toMatchObject({code:"provider"});
      expect(network).toHaveBeenCalledTimes(1);
    }finally{vi.unstubAllGlobals();}
  });
  it("repairs missing evidence once and still verifies the replacement before returning it",async()=>{
    const config=smartConfig({OPENAI_API_KEY:"explicit-qa-key-not-real"}),vector=Array(1536).fill(0) as number[];vector[0]=1;
    const repaired={status:"insufficient",blocks:[{text:"Explicit QA: available evidence is insufficient.",evidence:[]}],followUps:["Какви официални документи са налични?","Кога е потвърдено описаното събитие?"],timeSensitive:false};
    const replies:Record<string,unknown>[]=[{object:"list",model:"text-embedding-3-small",usage:{prompt_tokens:10},data:[{index:0,embedding:vector}]},
      ...[{relevant:true,evidenceSourceIds:[],needsResearch:false,researchQuery:"",explanation:"QA"},{...repaired,status:"answered"},repaired,{valid:true,reason:"QA verified limitation"}].map(result=>({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{content:[{type:"output_text",text:JSON.stringify(result)}]}]}))];
    const network=vi.fn(async()=>{const body=replies.shift();if(!body)throw new Error("Unexpected extra request");return Response.json(body);});vi.stubGlobal("fetch",network);
    try{
      const result=await answerSmartQuestion(db,config,await smartArticle(db,articleId),"Explicit QA question",[]);
      expect(result.status).toBe("insufficient");expect(network).toHaveBeenCalledTimes(5);expect(result.blocks[0]?.text).toContain("insufficient");
    }finally{vi.unstubAllGlobals();}
  });
});
