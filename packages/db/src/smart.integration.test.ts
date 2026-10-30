import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { acquireSmartNode, deleteSmartSession, finishSmartNode, finishSmartTurn, openSmartSession, pruneSmartPrivateData, readSmartSession, reserveSmartTurn, readSmartBootstrap, smartArticle, smartNodeKey,smartSourcesPublic, type SmartDb } from "./smart";
import { costFilters, parseOpenAiUsage, readAiCosts, settleAiOperation, startAiOperation } from "./ai-usage";
import type { SmartAnswer } from "@newspoint/content/smart";
import { prepareSmartArticle,answerSmartQuestion,askSmart,smartOwnedResearchSource } from "./smart-service";
import { smartConfig,smartJson } from "./smart-provider";
import {z} from "zod";
import * as smartWeb from "./smart-web";
import {recoverSmartJobs} from "../../../apps/worker/src/smart-worker";
import {searchSmartCandidates} from "./smart-retrieval";
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
const answerProviders=["minimax","openai"] as const;
function answerTestConfig(provider:typeof answerProviders[number]){
  return smartConfig({SMART_PROVIDER:provider,SMART_MODEL:"gpt-6-luna",MINIMAX_API_KEY:"qa-shared-provider-not-real",OPENAI_API_KEY:"qa-shared-provider-not-real"});
}
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
  it.each(answerProviders)("rejects an unrelated question before external research (%s)",async(provider)=>{
    const config=answerTestConfig(provider),article=await smartArticle(db,articleId),since=new Date().toISOString();
    const network=vi.fn(async()=>Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({queries:[],relevant:false,answer:null})}]}]}));
    vi.stubGlobal("fetch",network);
    try{
      const result=await answerSmartQuestion(db,config,article,"QA unrelated general chat",[]);
      expect(result.status).toBe("off_topic");expect(result.sources).toEqual([]);expect(result.followUps).toEqual([]);expect(network).toHaveBeenCalledTimes(1);
      const operations=await db.execute(sql`select operation from ai_operations where article_id=${articleId}::uuid and started_at>=${since}::timestamptz`);
      expect(operations.map(row=>row.operation)).toEqual(["retrieval"]);
    }finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${articleId}::uuid and started_at>=${since}::timestamptz`);}
  });

  it("reads OpenAI discovery pages after our archive and grounds the answer in page evidence, not search text",async()=>{
    const id=randomUUID(),config=answerTestConfig("openai"),url="https://example.org/official-biography";
    const currentText="QA: Анна Петрова коментира решението.",externalText="QA: Анна Петрова е журналист. Започва работа в регионален вестник.";
    await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,${JSON.stringify([{type:"paragraph",text:currentText}])}::jsonb,'/qa-openai-research/',published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const events:string[]=[],observed={execute:(q:SQL)=>{if(new PgDialect().sqlToQuery(q).sql.includes("candidates as"))events.push("archive");return db.execute(q);},transaction:db.transaction.bind(db)} as SmartDb;
    const page=vi.spyOn(smartWeb,"fetchSmartPage").mockImplementation(async requested=>{events.push("page");expect(requested).toBe(url);return {url,text:externalText};});
    const values=[
      {queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],relevant:true,needsResearch:true,researchQuery:"Анна Петрова биография",answer:null},
      {status:"answered",blocks:[{text:externalText,evidence:["e1"]}],followUps:["Има ли публикувани нейни интервюта?"],timeSensitive:false},
      {valid:true,factsValid:true,answerValid:true,reason:""},
    ];
    const network=vi.fn(async(requested:unknown,options:RequestInit)=>{
      expect(String(requested)).toBe("https://api.openai.com/v1/responses");
      const request=JSON.parse(String(options.body)),input=JSON.parse(request.input);
      if(request.tools){
        events.push("web");expect(request.include).toContain("web_search_call.action.sources");
        return Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[
          {type:"web_search_call",status:"completed",action:{type:"search",sources:[{type:"url",url}]}},
          {type:"message",content:[{type:"output_text",text:"QA unsupported search summary: the person was a doctor.",annotations:[]}]},
        ]});
      }
      if(input.previous!==undefined||input.result){
        expect(JSON.stringify(input.sources)).toContain(externalText);
        expect(JSON.stringify(input.sources)).not.toContain("was a doctor");
      }
      const value=values.shift();if(!value)throw Error("Unexpected provider call");
      return Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]});
    });vi.stubGlobal("fetch",network);
    try{
      const result=await answerSmartQuestion(observed,config,await smartArticle(db,id),"Каква е професионалната биография на Анна Петрова?",[]);
      expect(result.status).toBe("answered");expect(result.blocks[0]?.text).toBe(externalText);expect(result.sources).toHaveLength(1);expect(result.sources[0]).toMatchObject({kind:"external",url,passage:externalText});
      expect(events).toEqual(["archive","web","page"]);expect(network).toHaveBeenCalledTimes(4);expect(page).toHaveBeenCalledTimes(1);
      const operations=await db.execute(sql`select operation,provider,model from ai_operations where article_id=${id}::uuid order by started_at`);
      expect(operations.map(row=>row.operation)).toEqual(["retrieval","research","answer","verification"]);expect(operations.every(row=>row.provider==="openai"&&row.model==="gpt-6-luna")).toBe(true);
    }finally{page.mockRestore();vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${id}::uuid`);await db.execute(sql`delete from articles where id=${id}::uuid`);}
  });

  it("skips a duplicate assessment when the archive adds no evidence and meters search separately",async()=>{
    const config=smartConfig({MINIMAX_API_KEY:"explicit-qa-not-real",OPENAI_API_KEY:"must-not-use"}),article=await smartArticle(db,articleId);
    const result={status:"insufficient",blocks:[{text:"QA: недостатъчни доказателства.",evidence:[]}],followUps:["Какви официални документи са налични?","Кога е потвърдено описаното събитие?"],timeSensitive:false};
    const replies:any[]=[{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],researchQuery:"QA external evidence",answer:null},{base_resp:{status_code:0},organic:[]},result,{valid:true,reason:"QA"}];
    const network=vi.fn(async(url:unknown)=>{const value=replies.shift();return String(url).endsWith("/coding_plan/search")?Response.json(value):Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:100,output_tokens:60},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]});});
    const since=new Date().toISOString();vi.stubGlobal("fetch",network);
    try{
      expect((await answerSmartQuestion(db,config,article,"Explicit QA question",[],{requireExpansion:true})).status).toBe("insufficient");expect(network).toHaveBeenCalledTimes(4);
      for(const [url,options] of network.mock.calls as unknown as [string,RequestInit][]){expect(new URL(url).hostname).toBe("api.minimax.io");expect((options.headers as Record<string,string>).Authorization).toBe("Bearer explicit-qa-not-real");}
      const planning=JSON.parse(String((network.mock.calls as unknown as [string,RequestInit][])[0]![1].body));
      expect(JSON.parse(planning.input).requireExpansion).toBe(true);
      expect(planning.instructions).toContain('answer=null');
      const rows=await db.execute(sql`select operation,provider,model,status,article_id,amount_usd from ai_operations where article_id=${articleId}::uuid and started_at>=${since}::timestamptz order by started_at`);
      expect(rows.map(r=>r.operation)).toEqual(["retrieval","research_search","answer","verification"]);expect(rows.every(r=>r.provider==="minimax"&&r.article_id===articleId)).toBe(true);
      expect(rows.filter(r=>r.model==="MiniMax-M3.1-Flash").every(r=>r.status==="known"&&Number(r.amount_usd)>0)).toBe(true);expect(rows.find(r=>r.model==="MiniMax-Web-Search")).toMatchObject({status:"unknown",amount_usd:null});
    }finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where provider='minimax' and article_id=${articleId}::uuid and started_at>=${since}::timestamptz`);}
  });

  it("atomically replaces node dependencies and rejects a stale publisher without changing them",async()=>{
    const article=await smartArticle(db,articleId),key=smartNodeKey(article,randomUUID(),null,"qa-atomic-publish");
    const source={id:"qa-atomic",articleId,version:article.revision,kind:"current" as const,title:article.title,url:"https://newspoint.bg/qa/",passage:"Explicit QA source",publishedAt:article.publishedAt,checkedAt:new Date().toISOString()};
    let node=await acquireSmartNode(db,key,article,randomUUID(),"QA question",null);
    await db.execute(sql`insert into smart_dependencies(node_key,article_id,revision) values(${key},${articleId}::uuid,'old revision')`);
    const published={...answer,sources:[source]};await finishSmartNode(db,key,node.token!,published);
    expect((await db.execute(sql`select revision from smart_dependencies where node_key=${key}`)).map(r=>r.revision)).toEqual([article.revision]);
    await expect(finishSmartNode(db,key,randomUUID(),answer)).rejects.toMatchObject({code:"lease"});
    expect((await db.execute(sql`select revision from smart_dependencies where node_key=${key}`)).map(r=>r.revision)).toEqual([article.revision]);
    expect((await db.execute(sql`select answer from smart_nodes where key=${key}`))[0]?.answer).toEqual(published);
    await db.execute(sql`delete from smart_nodes where key=${key}`);
  });

  it("checks current article publication and revision even when the answer has only external or no sources",async()=>{
    const article=await smartArticle(db,articleId);
    expect(await smartSourcesPublic(db,[],article)).toBe(true);
    expect(await smartSourcesPublic(db,[],{...article,revision:"stale"})).toBe(false);
    expect(await smartSourcesPublic(db,[],{...article,id:randomUUID()})).toBe(false);
    await db.execute(sql`update articles set is_public=false where id=${articleId}::uuid`);
    try{expect(await smartSourcesPublic(db,[],article)).toBe(false);}finally{await db.execute(sql`update articles set is_public=true where id=${articleId}::uuid`);}
  });

  it("rolls back publication and dependency deletion together when a new dependency is invalid",async()=>{
    const article=await smartArticle(db,articleId),key=smartNodeKey(article,randomUUID(),null,"qa-atomic-rollback");
    const node=await acquireSmartNode(db,key,article,randomUUID(),"QA rollback question",null);
    await db.execute(sql`insert into smart_dependencies(node_key,article_id,revision) values(${key},${articleId}::uuid,'original')`);
    const invalid={...answer,sources:[{id:"qa-invalid",articleId:randomUUID(),version:"missing",kind:"newspoint" as const,title:"Explicit invalid dependency fixture",url:"https://example.org/qa",passage:"Explicit QA",publishedAt:new Date().toISOString(),checkedAt:new Date().toISOString()}]};
    await expect(finishSmartNode(db,key,node.token!,invalid)).rejects.toThrow();
    expect((await db.execute(sql`select state,answer from smart_nodes where key=${key}`))[0]).toMatchObject({state:"pending",answer:null});
    expect((await db.execute(sql`select revision from smart_dependencies where node_key=${key}`)).map(r=>r.revision)).toEqual(["original"]);
    await db.execute(sql`delete from smart_nodes where key=${key}`);
  });

  it.each(answerProviders.flatMap(provider=>[true,false].map(validQuote=>({provider,validQuote}))))("searches our archive even with a ready draft and independently approves an uncited related card ($provider, $validQuote)",async({provider,validQuote})=>{
    const currentId=randomUUID(),relatedId=randomUUID(),config=answerTestConfig(provider);
    const currentText="QA: Анна Петрова коментира решението.",relatedText="QABioCardTerm: Журналистката Анна Петрова започва работа в регионален вестник.";
    for(const [id,text,path] of [[currentId,currentText,"/qa-card-current/"],[relatedId,relatedText,"/qa-card-related/"]])await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,${JSON.stringify([{type:"paragraph",text}])}::jsonb,${path},published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const article=await smartArticle(db,currentId),draft={status:"answered",blocks:[{text:currentText,evidence:["e0"]}],followUps:["Къде е публикувано решението?"],timeSensitive:false};
    const values:any[]=[{queries:["QABioCardTerm","NoMatchingQATerm123"],answer:draft,needsResearch:false},{valid:true,factsValid:true,answerValid:true,reason:"",relatedArticles:[{index:1,quote:validQuote?relatedText:"QA: Това е измислен цитат и не присъства в публикацията."},{index:0,quote:currentText}]}];
    const network=vi.fn(async(_url:unknown,options:RequestInit)=>{const value=values.shift();if(!value)throw Error("Unexpected model call");const input=JSON.parse(JSON.parse(String(options.body)).input);if(input.result)expect(input.relatedCandidates).toEqual([1]);return Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]});});vi.stubGlobal("fetch",network);
    try{const result=await answerSmartQuestion(db,config,article,"Какво коментира Анна Петрова и къде има повече за нея?",[]);expect(result.relatedArticleIds).toEqual(validQuote?[relatedId]:[]);expect(result.blocks[0]!.text).toBe(currentText);expect(result.blocks[0]!.sourceIds).toHaveLength(1);expect(result.sources.some(source=>source.articleId===relatedId)).toBe(validQuote);expect(network).toHaveBeenCalledTimes(2);expect(network.mock.calls.every(([url])=>!String(url).endsWith("/coding_plan/search"))).toBe(true);}
    finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${currentId}::uuid`);await db.execute(sql`delete from articles where id in (${currentId}::uuid,${relatedId}::uuid)`);}
  });

  it("researches a linked person's missing biography after our archive, tries a distinct empty-search alternative and reads beyond blocked results",async()=>{
    const id=randomUUID(),config=smartConfig({MINIMAX_API_KEY:"qa-person-research"}),currentText="QA: Анна Петрова коментира новото решение.";
    await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,${JSON.stringify([{type:"paragraph",text:currentText}])}::jsonb,'/qa-linked-person/',published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const article=await smartArticle(db,id),externalText="QA: Анна Петрова е журналист. Започва професионалната си кариера в регионален вестник.";
    const urls=[1,2,3,4].map(n=>({title:`QA source ${n}`,link:`https://example.org/qa-${n}`}));
    const page=vi.spyOn(smartWeb,"fetchSmartPage").mockImplementation(async url=>{if(url.endsWith("qa-4"))return {url,text:externalText};throw Error("QA blocked page");});
    const events:string[]=[],observed={execute:(q:SQL)=>{if(new PgDialect().sqlToQuery(q).sql.includes("candidates as"))events.push("archive");return db.execute(q);},transaction:db.transaction.bind(db)} as SmartDb;
    const values:any[]=[{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],answer:null,needsResearch:true,relevant:true,researchQuery:"Анна Петрова биография",researchAlternative:"Анна Петрова журналист кариера"},{base_resp:{status_code:0},organic:[]},{base_resp:{status_code:0},organic:urls},{status:"answered",blocks:[{text:externalText,evidence:["e1"]}],followUps:["Има ли публикувани нейни интервюта?"],timeSensitive:false},{valid:true,factsValid:true,answerValid:true,reason:"",relatedArticles:[{index:1,quote:externalText}]}];
    const network=vi.fn(async(url:unknown,options:RequestInit)=>{const value=values.shift();if(!value)throw Error("Unexpected provider call");if(String(url).endsWith("/coding_plan/search")){events.push("web");return Response.json(value);}const input=JSON.parse(JSON.parse(String(options.body)).input);if(input.previous!==undefined)expect(input.answerDepth).toBe("expanded");return Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]});});vi.stubGlobal("fetch",network);
    try{const result=await answerSmartQuestion(observed,config,article,"Каква е професионалната биография на Анна Петрова?",[]);expect(result.status).toBe("answered");expect(result.sources[0]?.kind).toBe("external");expect(result.sources[0]?.url).toBe(urls[3]!.link);expect(result.relatedArticleIds).toEqual([]);expect(events.indexOf("archive")).toBeLessThan(events.indexOf("web"));expect(page).toHaveBeenCalledTimes(4);const searches=network.mock.calls.filter(([url])=>String(url).endsWith("/coding_plan/search"));expect(searches).toHaveLength(2);expect(searches.map(([,options])=>JSON.parse(String(options.body)).q)).toEqual(["Анна Петрова биография","Анна Петрова журналист кариера"]);}
    finally{page.mockRestore();vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${id}::uuid`);await db.execute(sql`delete from articles where id=${id}::uuid`);}
  });

  it.each(answerProviders)("prefetches at most six pages, preserves slow source priority, and cancels unused reads without another search (%s)",async(provider)=>{
    const id=randomUUID(),config=answerTestConfig(provider),urls=Array.from({length:8},(_,index)=>`https://example.org/qa-priority-${index}`);
    await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,'[]'::jsonb,'/qa-source-priority/',published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const passage=(index:number)=>`QA verified source ${index}: The public decision was recorded on 29 October 2026. This explicit test source contains the supporting record.`;
    let releaseFirst!:()=>void,allStarted!:()=>void,writerStarted=false,unusedCancelled=false,searches=0;
    const started:string[]=[],startedPromise=new Promise<void>(resolve=>{allStarted=resolve;});
    const page=vi.spyOn(smartWeb,"fetchSmartPage").mockImplementation((url,_redirects,signal)=>{
      const index=urls.indexOf(url);started.push(url);expect(signal).toBeDefined();
      if(started.length===6)allStarted();
      if(index===0)return new Promise(resolve=>{releaseFirst=()=>resolve({url,text:passage(index)});});
      if(index===1)return Promise.reject(new Error("QA blocked preferred page"));
      if(index===4)return new Promise((_resolve,reject)=>{signal!.addEventListener("abort",()=>{unusedCancelled=true;reject(new Error("QA cancelled unused page"));},{once:true});});
      return Promise.resolve({url,text:passage(index)});
    });
    const selected=[0,2,3],values=[
      {queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],answer:null,needsResearch:true,researchQuery:"QA official source records"},
      {status:"answered",blocks:selected.map((index,evidence)=>({text:passage(index),evidence:[`e${evidence}`]})),followUps:["Има ли публикувани други решения?"],timeSensitive:false},
      {valid:true,factsValid:true,answerValid:true,reason:""},
    ];
    const network=vi.fn(async(requested:unknown,options:RequestInit)=>{
      const request=JSON.parse(String(options.body));
      if(String(requested).endsWith("/coding_plan/search")||request.tools){
        searches++;return provider==="minimax"?Response.json({base_resp:{status_code:0},organic:urls.map((link,index)=>({title:`QA source ${index}`,link}))}):Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"web_search_call",status:"completed",action:{type:"search",sources:urls.map(url=>({type:"url",url}))}}]});
      }
      const input=JSON.parse(request.input);
      if(input.previous!==undefined||input.result){
        writerStarted=true;
        expect(input.sources.filter((source:any)=>source.kind==="external").map((source:any)=>source.url)).toEqual(selected.map(index=>urls[index]));
      }
      const value=values.shift();if(!value)throw Error("Unexpected provider call");return Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]});
    });vi.stubGlobal("fetch",network);
    try{
      const pending=answerSmartQuestion(db,config,await smartArticle(db,id),"QA: Какво показват официалните решения?",[]);
      await startedPromise;
      expect(started).toEqual(urls.slice(0,6));expect(page).toHaveBeenCalledTimes(6);expect(searches).toBe(1);
      await Promise.resolve();await Promise.resolve();
      // Faster low-priority pages cannot replace the still-pending first source.
      expect(writerStarted).toBe(false);expect(unusedCancelled).toBe(false);
      releaseFirst();const result=await pending;
      expect(result.status).toBe("answered");expect(result.sources.map(source=>source.url)).toEqual(selected.map(index=>urls[index]));
      expect(unusedCancelled).toBe(true);expect(searches).toBe(1);expect(network).toHaveBeenCalledTimes(4);
    }finally{page.mockRestore();vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${id}::uuid`);await db.execute(sql`delete from articles where id=${id}::uuid`);}
  });

  it("does not stop at readable but unhelpful external news when the question needs a biography",async()=>{
    const id=randomUUID(),config=smartConfig({MINIMAX_API_KEY:"qa-missing-details"});
    await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,'[]'::jsonb,'/qa-details/',published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const article=await smartArticle(db,id),generic="QA: Министърът коментира днешната новина, но тук няма биографични данни.",bio="QA: Анна Петрова работи като лекар преди да заеме министерския пост.";
    const page=vi.spyOn(smartWeb,"fetchSmartPage").mockImplementation(async url=>({url,text:url.endsWith("/biography")?bio:generic}));
    const values:any[]=[{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],answer:null,researchQuery:"Анна Петрова биография",researchAlternative:"Anna Petrova official biography"},{base_resp:{status_code:0},organic:[{title:"QA generic news",link:"https://example.org/news"}]},{status:"insufficient",blocks:[{text:"QA: Липсват данни за професионалния път.",evidence:[]}],followUps:["Има ли официално интервю?"],timeSensitive:false},{base_resp:{status_code:0},organic:[{title:"QA biography",link:"https://example.org/biography"}]},{status:"answered",blocks:[{text:bio,evidence:["e1"]}],followUps:["Има ли официално интервю?"],timeSensitive:false},{valid:true,factsValid:true,answerValid:true,reason:""}];
    const network=vi.fn(async(url:unknown)=>{const value=values.shift();if(!value)throw Error("Unexpected extra request");return String(url).endsWith("/coding_plan/search")?Response.json(value):Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]});});vi.stubGlobal("fetch",network);
    try{const result=await answerSmartQuestion(db,config,article,"Какъв е професионалният път на Анна Петрова?",[]);expect(result.status).toBe("answered");expect(result.blocks[0]?.text).toBe(bio);expect(result.sources).toHaveLength(1);expect(result.sources[0]?.url).toBe("https://example.org/biography");expect(network).toHaveBeenCalledTimes(6);const operations=await db.execute(sql`select operation from ai_operations where article_id=${id}::uuid order by started_at`);expect(operations.map(row=>row.operation)).toEqual(["retrieval","research_search","answer","research_search","answer_repair","verification"]);}
    finally{page.mockRestore();vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${id}::uuid`);await db.execute(sql`delete from articles where id=${id}::uuid`);}
  });

  it("retrieves MiniMax candidates from body content and excludes old, private, future and current articles",async()=>{
    const ids:string[]=[];
    for(const [age,visible] of [["1 day",true],["7 months",true],["1 day",false],["-1 day",true]] as const){
      const id=randomUUID();ids.push(id);
      await db.execute(sql`insert into articles select ${id}::uuid,'Different fixture headline','',${JSON.stringify([{type:"paragraph",text:"QAUniqueBodyTerm водоснабдяване"}])}::jsonb,path,published_revision,source_modified_at,${visible},now()-${age}::interval,updated_at from articles where id=${articleId}::uuid`);
    }
    const rows=await searchSmartCandidates(db,articleId,["QAUniqueBodyTerm"]);
    expect(rows.map(row=>row.article_id)).toEqual([ids[0]]);
    expect(rows[0]!.text).toContain("водоснабдяване");
    expect(await searchSmartCandidates(db,ids[0]!,["QAUniqueBodyTerm"])).toEqual([]);
    expect(await searchSmartCandidates(db,articleId,["'; drop table articles; --"])).toEqual([]);
    for(const id of ids)await db.execute(sql`delete from articles where id=${id}::uuid`);
  });

  it("does not reintroduce old or private own coverage through external search URLs",async()=>{
    const config=smartConfig({SMART_PROVIDER:"openai"}),current=await smartArticle(db,articleId),oldId=randomUUID(),privateId=randomUUID();
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
  it("counts three answers once each and rejects the fourth",async()=>{
    const id=await openSmartSession(db,articleId,"limit-reader");
    for(let i=0;i<3;i++){
      const input={sessionId:id,requestKey:randomUUID(),question:`QA fixture question ${i}`};
      const turn=await reserveSmartTurn(db,"limit-reader",input);
      expect((await reserveSmartTurn(db,"limit-reader",input)).id).toBe(turn.id);
      await finishSmartTurn(db,String(turn.id),answer,false,null);
      await finishSmartTurn(db,String(turn.id),answer,false,null);
    }
    expect((await readSmartSession(db,id,"limit-reader")).usedQuestions).toBe(3);
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
  it("keeps the three-question cooldown across reopening and retries, and renews only after ten server minutes",async()=>{
    const owner="qa-cooldown-reader",sessionId=await openSmartSession(db,articleId,owner),keys:string[]=[];
    for(let i=0;i<3;i++){const key=randomUUID();keys.push(key);const turn=await reserveSmartTurn(db,owner,{sessionId,requestKey:key,question:`QA cooldown question ${i}`});await finishSmartTurn(db,String(turn.id),answer,false,null);}
    const first=await readSmartSession(db,sessionId,owner);expect(first.usedQuestions).toBe(3);expect(first.maxQuestions).toBe(3);expect(first.quotaResetAt).not.toBeNull();expect(Date.parse(first.quotaResetAt!)-Date.parse(first.serverNow)).toBeGreaterThan(599000);
    for(let i=0;i<3;i++){expect(await openSmartSession(db,articleId,owner)).toBe(sessionId);const restored=await readSmartSession(db,sessionId,owner);expect(restored.usedQuestions).toBe(3);expect(restored.quotaResetAt).toBe(first.quotaResetAt);}
    const retried=await reserveSmartTurn(db,owner,{sessionId,requestKey:keys[2]!,question:"QA cooldown question 2"});expect(retried.status).toBe("completed");
    await expect(reserveSmartTurn(db,owner,{sessionId,requestKey:randomUUID(),question:"QA forbidden fourth"})).rejects.toMatchObject({code:"question_limit",status:429});
    await db.execute(sql`update smart_sessions set updated_at=now()-interval '9 minutes 59 seconds' where id=${sessionId}::uuid`);
    await expect(reserveSmartTurn(db,owner,{sessionId,requestKey:randomUUID(),question:"QA still blocked"})).rejects.toMatchObject({code:"question_limit"});
    await db.execute(sql`update smart_sessions set updated_at=now()-interval '10 minutes 1 second' where id=${sessionId}::uuid`);
    const renewed=await readSmartSession(db,sessionId,owner);expect(renewed.usedQuestions).toBe(0);expect(renewed.quotaResetAt).toBeNull();expect(renewed.turns).toHaveLength(3);
    expect((await db.execute(sql`select used from smart_sessions where id=${sessionId}::uuid`))[0]?.used).toBe(3);
    const turn=await reserveSmartTurn(db,owner,{sessionId,requestKey:randomUUID(),question:"QA new window"});expect(turn.session_used).toBe(0);await finishSmartTurn(db,String(turn.id),answer,false,null);
    const after=await readSmartSession(db,sessionId,owner);expect(after.usedQuestions).toBe(1);expect(after.turns).toHaveLength(4);expect(after.turns.at(-1)?.question).toBe("QA new window");
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
  it("reads a public follow-up lineage in one query, preserves parent identity, and rejects unreceived parents and cycles without provider calls",async()=>{
    const article=await smartArticle(db,articleId),config=smartConfig({}),owner="qa-lineage-reader",sessionId=await openSmartSession(db,articleId,owner);
    const first={id:randomUUID(),text:"QA first public question"},second={id:randomUUID(),text:"QA second public question"},third={id:randomUUID(),text:"QA third public question"};
    const root=smartNodeKey(article,first.id,null,"qa-lineage-root");
    const firstAnswer={...answer,followUps:[second]};let lease=await acquireSmartNode(db,root,article,first.id,first.text,null);await finishSmartNode(db,root,lease.token!,firstAnswer);
    const child=smartNodeKey(article,second.id,root,`${firstAnswer.checkedAt}:${config.provider}:${config.model}`);
    const secondAnswer={...answer,followUps:[third]};lease=await acquireSmartNode(db,child,article,second.id,second.text,root);await finishSmartNode(db,child,lease.token!,secondAnswer);
    const final=smartNodeKey(article,third.id,child,`${secondAnswer.checkedAt}:${config.provider}:${config.model}`);lease=await acquireSmartNode(db,final,article,third.id,third.text,child);await finishSmartNode(db,final,lease.token!,answer);
    for(const [q,nodeKey,result] of [[first,root,firstAnswer],[second,child,secondAnswer]] as const){const turn=await reserveSmartTurn(db,owner,{sessionId,requestKey:randomUUID(),question:q.text});await finishSmartTurn(db,String(turn.id),result,true,nodeKey);}
    const execute=vi.fn((q:SQL)=>db.execute(q)),observed={execute,transaction:db.transaction.bind(db)} as SmartDb;
    const network=vi.fn(()=>{throw Error("Lineage cache must not call a model");});vi.stubGlobal("fetch",network);
    const input={sessionId,requestKey:randomUUID(),questionId:third.id,question:third.text,parentKey:child};
    try{
      const result=await askSmart(observed,config,owner,input,true);expect(result?.turns.at(-1)?.cached).toBe(true);expect(result?.usedQuestions).toBe(3);
      expect(execute.mock.calls.filter(([q])=>new PgDialect().sqlToQuery(q).sql.includes("with recursive lineage"))).toHaveLength(1);
      const outsider=await openSmartSession(db,articleId,"qa-lineage-outsider");await expect(askSmart(db,config,"qa-lineage-outsider",{...input,sessionId:outsider,requestKey:randomUUID()},true)).rejects.toMatchObject({code:"question_changed"});
      await db.execute(sql`update smart_nodes set parent_key=${child} where key=${root}`);
      await expect(askSmart(db,config,owner,{...input,requestKey:randomUUID()},true)).rejects.toMatchObject({code:"lineage"});expect(network).not.toHaveBeenCalled();
    }finally{vi.unstubAllGlobals();await db.execute(sql`update smart_nodes set parent_key=null where key=${root}`);await db.execute(sql`delete from smart_nodes where key=${root}`);}
  });

  it("serves the same public question to two readers with zero provider requests",async()=>{
    const article=await smartArticle(db,articleId),questionId=randomUUID(),question="Explicit cached QA question";
    await db.execute(sql`insert into smart_bootstraps(article_id,revision,payload,sources,state,expires_at)
      values(${articleId}::uuid,${article.revision},${JSON.stringify({questions:[{id:questionId,text:question}]})}::jsonb,'[]','ready',now()+interval '1 hour')`);
    const rows=await db.execute(sql`select updated_at from smart_bootstraps where article_id=${articleId}::uuid`);
    const config=smartConfig({}),key=smartNodeKey(article,questionId,null,`${new Date(rows[0]!.updated_at as string).toISOString()}:${config.provider}:${config.model}`);
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
    const config=smartConfig({SMART_PROVIDER:"openai",OPENAI_API_KEY:"explicit-qa-key-not-real"}),article=await smartArticle(db,articleId);
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
      await expect(smartJson(db,smartConfig({SMART_PROVIDER:"openai",OPENAI_API_KEY:"explicit-qa-key-not-real"}),await smartArticle(db,articleId),"assessment","QA",{},z.object({value:z.string()}))).rejects.toMatchObject({code:"provider"});
      expect(network).toHaveBeenCalledTimes(1);
    }finally{vi.unstubAllGlobals();}
  });
  it("repairs missing evidence once and still verifies the replacement before returning it",async()=>{
    const config=smartConfig({SMART_PROVIDER:"openai",OPENAI_API_KEY:"explicit-qa-key-not-real"});
    const repaired={status:"insufficient",blocks:[{text:"Explicit QA: available evidence is insufficient.",evidence:[]}],followUps:["Какви официални документи са налични?","Кога е потвърдено описаното събитие?"],timeSensitive:false};
    const replies:Record<string,unknown>[]=[{id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{content:[{type:"output_text",text:JSON.stringify({queries:["NoMatchingQATerm123","AnotherMissingQATerm456"]})}]}]},
      ...[{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],relevant:true,evidenceSourceIds:[],needsResearch:false,researchQuery:"",explanation:"QA"},{...repaired,status:"answered"},repaired,{valid:true,reason:"QA verified limitation"}].map(result=>({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{content:[{type:"output_text",text:JSON.stringify(result)}]}]}))];
    const network=vi.fn(async()=>{const body=replies.shift();if(!body)throw new Error("Unexpected extra request");return Response.json(body);});vi.stubGlobal("fetch",network);
    try{
      const result=await answerSmartQuestion(db,config,await smartArticle(db,articleId),"Explicit QA question",[]);
      expect(result.status).toBe("insufficient");expect(network).toHaveBeenCalledTimes(5);expect(result.blocks[0]?.text).toContain("insufficient");
    }finally{vi.unstubAllGlobals();}
  });
  it("separates provider/model spend, unknown amounts, lifetime totals and the global overview",async()=>{
    const id=randomUUID();await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,body,'/provider-comparison-qa/',published_revision,source_modified_at,is_public,published_at,updated_at from articles where id=${articleId}::uuid`);
    const usage={input:1000,cachedInput:0,cacheWrite:0,output:200,reasoning:100,searches:0};
    for(const [provider,model,known] of [["openai","gpt-6.1-sol",true],["minimax","MiniMax-M3.1-Flash",true],["minimax","MiniMax-M3",false]] as const){const op=await startAiOperation(db,{module:"smart",provider,model,articleId:id,operation:"comparison_qa",environment:"test"});await settleAiOperation(db,op,model,known?usage:null,null,null);}
    const base={start:new Date('1970-01-01'),end:new Date(Date.now()+60000),module:"smart",article:id,environment:"test",page:1};
    const all=await readAiCosts(db,base);expect(all.models).toHaveLength(3);expect(all.models.find(row=>row.model==='MiniMax-M3')?.amount).toBeNull();
    const minimax=await readAiCosts(db,{...base,provider:"minimax",model:"MiniMax-M3.1-Flash"});
    expect(minimax.totals?.calls).toBe(1);expect(Number(minimax.totals?.amount)).toBe(.00027);expect(Number(minimax.articles[0]?.lifetimeAmount)).toBe(.00027);
    expect(minimax.operations[0]).toMatchObject({provider:"minimax",model:"MiniMax-M3.1-Flash"});expect(minimax.models).toHaveLength(1);expect(Number(minimax.models[0]?.tokenAmount)).toBe(.00027);expect(Number(minimax.models[0]?.searchAmount)).toBe(0);expect(minimax.cacheAttributionAvailable).toBe(false);
    expect(minimax.grandTotals).toEqual(all.grandTotals);expect(Number(minimax.grandTotals?.calls)).toBeGreaterThan(3);
    const unknown=await readAiCosts(db,{...base,provider:"minimax",model:"MiniMax-M3"});expect(unknown.totals?.amount).toBeNull();expect(unknown.models[0]?.searchAmount).toBeNull();
    const openai=await readAiCosts(db,{...base,provider:"openai"});expect(Number(openai.totals?.amount)).toBe(.004);expect(openai.models).toHaveLength(1);
    await db.execute(sql`delete from ai_operations where article_id=${id}::uuid`);await db.execute(sql`delete from articles where id=${id}::uuid`);
  });
  it("validates provider/model report filters without treating them as model execution",()=>{
    expect(costFilters(new URLSearchParams('provider=minimax&model=MiniMax-M3.1-Flash'))).toMatchObject({provider:"minimax",model:"MiniMax-M3.1-Flash"});
    expect(()=>costFilters(new URLSearchParams('provider=x%27%3Bdrop'))).toThrow('invalid_provider');
    expect(()=>costFilters(new URLSearchParams('model=x%20OR%201'))).toThrow('invalid_model');
  });

  it("returns a checked partial answer when research fails and avoids repeated unknown-cost searches",async()=>{
    const config=smartConfig({MINIMAX_API_KEY:"qa-not-real"}),article=await smartArticle(db,articleId),since=new Date().toISOString();
    const answer={status:"insufficient",blocks:[{text:"QA: липсват външни доказателства.",evidence:[]}],followUps:["Какви официални документи са налични?","Кога е потвърдено описаното събитие?"],timeSensitive:false};
    const response=(value:unknown)=>Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]});
    let searches=0;
    const network=vi.fn(async(_url:unknown,options:RequestInit)=>{const body=JSON.parse(String(options.body));if(String(_url).endsWith("/coding_plan/search")){searches++;throw new Error("QA timeout");}const input=JSON.parse(body.input);if(input.originalInput)throw new Error("Unexpected format repair");if(input.title)return response({queries:["NoMatchingQATerm123","AnotherMissingQATerm456"]});if(input.result)return response({valid:true,reason:"QA"});if(input.previous!==undefined)return response(answer);return response({queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],relevant:true,evidenceSourceIds:[],needsResearch:true,researchQuery:"QA external",explanation:"QA"});});vi.stubGlobal("fetch",network);
    try{for(let i=0;i<2;i++){const result=await answerSmartQuestion(db,config,article,"Explicit QA question",[]);expect(result.status).toBe("insufficient");expect(result.blocks.at(-1)?.text).toContain("Външното проучване не завърши");expect(Date.parse(result.expiresAt)-Date.parse(result.checkedAt)).toBeLessThanOrEqual(300000);}expect(searches).toBe(1);}
    finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${articleId}::uuid and started_at>=${since}::timestamptz`);}
  });

  it("refreshes a cached bootstrap with two questions instead of presenting it as the new three-question start",async()=>{
    const id=randomUUID();await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,body,'/three-question-qa/',published_revision,source_modified_at,is_public,published_at,updated_at from articles where id=${articleId}::uuid`);
    const article=await smartArticle(db,id);const payload={status:"ready",articleId:id,version:article.revision,related:null,questions:[{id:"qa1",text:"Explicit QA first question"},{id:"qa2",text:"Explicit QA second question"}]};
    await db.execute(sql`insert into smart_bootstraps(article_id,revision,payload,sources,state,expires_at) values(${id}::uuid,${article.revision},${JSON.stringify(payload)}::jsonb,'[]','ready',now()+interval '1 hour')`);
    expect((await readSmartBootstrap(db,id)).status).toBe("preparing");
    payload.questions.push({id:"qa3",text:"Explicit QA third question"});await db.execute(sql`update smart_bootstraps set state='ready',payload=${JSON.stringify(payload)}::jsonb,expires_at=now()+interval '1 hour' where article_id=${id}::uuid`);
    expect((await readSmartBootstrap(db,id)).questions).toHaveLength(3);await db.execute(sql`delete from articles where id=${id}::uuid`);
  });

  it("keeps an uncertain bootstrap readable and retries only on explicit activation without stealing a pending lease",async()=>{
    const id=randomUUID();await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,body,'/retry-bootstrap-qa/',published_revision,source_modified_at,is_public,published_at,updated_at from articles where id=${articleId}::uuid`);
    const article=await smartArticle(db,id);await db.execute(sql`insert into smart_bootstraps(article_id,revision,state) values(${id}::uuid,${article.revision},'uncertain')`);
    const unavailable=await readSmartBootstrap(db,id);expect(unavailable.status).toBe('unavailable');expect(unavailable.message).not.toContain('екипа');
    expect(await readSmartBootstrap(db,id,false,true)).toBeNull();expect((await db.execute(sql`select state from smart_bootstraps where article_id=${id}::uuid`))[0]?.state).toBe('uncertain');
    expect((await readSmartBootstrap(db,id,true)).status).toBe('preparing');
    const token=randomUUID();await db.execute(sql`update smart_bootstraps set lease_token=${token}::uuid,lease_until=now()+interval '10 minutes' where article_id=${id}::uuid`);
    await readSmartBootstrap(db,id,true);expect((await db.execute(sql`select lease_token from smart_bootstraps where article_id=${id}::uuid`))[0]?.lease_token).toBe(token);
    await db.execute(sql`delete from articles where id=${id}::uuid`);
  });
  it("repairs rejected starting questions automatically and does not let an optional related card block them",async()=>{
    const config=smartConfig({MINIMAX_API_KEY:'qa-not-real'}),article=await smartArticle(db,articleId),since=new Date().toISOString();
    const draft={questions:['Кои документи липсват за този случай?','Какви са възможните последици за гражданите?','Какъв е следващият проверим етап?'],related:{sourceId:null,reason:'',quote:''}};
    const responses=[{queries:['NoMatchingQATerm123','AnotherMissingQATerm456']},draft,{questionsValid:false,relatedValid:false,reason:'QA: поправи предпоставката'},draft,{questionsValid:true,relatedValid:false,reason:'QA: трите въпроса са валидни'}];
    const network=vi.fn(async(_url:unknown,options:RequestInit)=>{const value=responses.shift();if(!value)throw new Error('Unexpected extra request');const body=JSON.parse(String(options.body));return Response.json({id:randomUUID(),model:body.model,status:'completed',usage:{input_tokens:10,output_tokens:10},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});});vi.stubGlobal('fetch',network);
    try{const result=await prepareSmartArticle(db,config,article);expect(result.payload.questions).toHaveLength(3);expect(result.payload.related).toBeNull();expect(network).toHaveBeenCalledTimes(5);expect(JSON.parse(network.mock.calls[3]![1].body as string).model).toBe('MiniMax-M3');}
    finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${articleId}::uuid and started_at>=${since}::timestamptz`);}
  });

  it.each(answerProviders)("reuses fresh verified source passages from history without paying for retrieval again (%s)",async(provider)=>{
    const config=answerTestConfig(provider),article=await smartArticle(db,articleId),since=new Date().toISOString();
    const source={id:'qa-inherited',articleId:null,version:'qa',kind:'external' as const,title:'QA source',url:'https://example.org/qa',publishedAt:null,checkedAt:new Date().toISOString(),passage:'Explicit QA evidence for a verified follow-up.'};
    const previous:SmartAnswer={status:'answered',blocks:[{text:'QA previous',sourceIds:[source.id]}],sources:[source],followUps:[],checkedAt:source.checkedAt,expiresAt:new Date(Date.now()+60000).toISOString()};
    const values=[{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],relevant:true,evidenceSourceIds:["s1"],needsResearch:false,researchQuery:'',explanation:'QA'}, {status:'answered',blocks:[{text:'QA supported answer',evidence:['e0']}],followUps:['Какво следва по тази история?','Какви документи предстоят по случая?'],timeSensitive:false},{valid:true,reason:'QA'}];
    const network=vi.fn(async(_url:unknown,options:RequestInit)=>{const value=values.shift();if(!value)throw new Error('Unexpected paid step');const body=JSON.parse(String(options.body));return Response.json({id:randomUUID(),model:body.model,status:'completed',usage:{input_tokens:10,output_tokens:10},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});});vi.stubGlobal('fetch',network);
    try{const result=await answerSmartQuestion(db,config,article,'QA follow-up',[{question:'QA prior question',answer:previous}]);expect(result.status).toBe('answered');expect(network).toHaveBeenCalledTimes(3);expect(JSON.parse(String(network.mock.calls[0]![1].body)).input).toContain(source.passage);}
    finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${articleId}::uuid and started_at>=${since}::timestamptz`);}
  });

  it.each(answerProviders)("never publishes an indexed quote when the independent reviewer rejects its claim (%s)",async(provider)=>{
    const config=answerTestConfig(provider),article=await smartArticle(db,articleId),since=new Date().toISOString();
    const source={id:"qa-review-source",articleId:null,version:"qa",kind:"external" as const,title:"QA",url:"https://example.org/qa",publishedAt:null,checkedAt:new Date().toISOString(),passage:"QA: the person is alive; the event is not cancelled."};
    const prior:SmartAnswer={status:"answered",blocks:[{text:"QA",sourceIds:[source.id]}],sources:[source],followUps:[],checkedAt:source.checkedAt,expiresAt:new Date(Date.now()+60000).toISOString()};
    const draft={status:"answered",blocks:[{text:"QA unsupported death claim",evidence:["e0"]}],followUps:["Има ли документи по случая?","Какво е известно за датата?"],timeSensitive:true};
    const values=[{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],relevant:true,evidenceSourceIds:["s1"],needsResearch:false,researchQuery:"",explanation:"QA"},draft,{valid:false,reason:"QA: unsupported death claim"},draft,{valid:false,reason:"QA: still unsupported"}];
    const network=vi.fn(async()=>Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(values.shift())}]}]}));vi.stubGlobal("fetch",network);
    try{await expect(answerSmartQuestion(db,config,article,"QA question",[{question:"prior",answer:prior}])).rejects.toMatchObject({code:"evidence"});expect(network).toHaveBeenCalledTimes(5);}
    finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${articleId}::uuid and started_at>=${since}::timestamptz`);}
  });
  it.each(answerProviders)("selects one independently approved continuation without regenerating valid facts (%s)",async(provider)=>{
    const config=answerTestConfig(provider),article=await smartArticle(db,articleId),since=new Date().toISOString();
    const source={id:"qa-select-source",articleId:null,version:"qa",kind:"external" as const,title:"QA",url:"https://example.org/qa",publishedAt:null,checkedAt:new Date().toISOString(),passage:"QA: the decision was approved on 29 October 2026."};
    const prior:SmartAnswer={status:"answered",blocks:[{text:"QA",sourceIds:[source.id]}],sources:[source],followUps:[],checkedAt:source.checkedAt,expiresAt:new Date(Date.now()+60000).toISOString()};
    const questions=["Кога ще бъде издадена гарантираната присъда?","Има ли други документи по случая?","Какво е известно за датата?"];
    const values=[{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],relevant:true,evidenceSourceIds:["s1"],needsResearch:false,researchQuery:"",explanation:"QA"},{status:"answered",blocks:[{text:"QA approved decision",evidence:["e0"]}],followUps:questions,timeSensitive:true},{valid:false,factsValid:true,answerValid:true,invalidFollowUps:[0],reason:"QA unsupported premise in first suggestion"}];
    const network=vi.fn(async()=>Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(values.shift())}]}]}));vi.stubGlobal("fetch",network);
    try{const result=await answerSmartQuestion(db,config,article,"QA question",[{question:"prior",answer:prior}]);expect(result.status).toBe("answered");expect(result.followUps.map(q=>q.text)).toEqual(questions.slice(1,2));expect(network).toHaveBeenCalledTimes(3);}
    finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${articleId}::uuid and started_at>=${since}::timestamptz`);}
  });

  it.each(answerProviders)("keeps one of two independently approved continuations without regenerating valid facts (%s)",async(provider)=>{
    const config=answerTestConfig(provider),article=await smartArticle(db,articleId),since=new Date().toISOString();
    const source={id:"qa-select-source",articleId:null,version:"qa",kind:"external" as const,title:"QA",url:"https://example.org/qa",publishedAt:null,checkedAt:new Date().toISOString(),passage:"QA: the decision was approved on 29 October 2026."};
    const prior:SmartAnswer={status:"answered",blocks:[{text:"QA",sourceIds:[source.id]}],sources:[source],followUps:[],checkedAt:source.checkedAt,expiresAt:new Date(Date.now()+60000).toISOString()};
    const questions=["Кога ще бъде издадена гарантираната присъда?","Има ли други документи по случая?","Какво е известно за датата?"];
    const values=[{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],relevant:true,evidenceSourceIds:["s1"],needsResearch:false,researchQuery:"",explanation:"QA"},{status:"answered",blocks:[{text:"QA approved decision",evidence:["e0"]}],followUps:questions.slice(0,2),timeSensitive:true},{valid:false,factsValid:true,answerValid:true,invalidFollowUps:[0],reason:"QA unsupported premise in first suggestion"}];
    const network=vi.fn(async()=>Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(values.shift())}]}]}));vi.stubGlobal("fetch",network);
    try{const result=await answerSmartQuestion(db,config,article,"QA question",[{question:"prior",answer:prior}]);expect(result.status).toBe("answered");expect(result.followUps.map(q=>q.text)).toEqual(questions.slice(1,2));expect(network).toHaveBeenCalledTimes(3);}
    finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${articleId}::uuid and started_at>=${since}::timestamptz`);}
  });

  it.each(answerProviders)("answers from the current article in two independent calls and attributes both charges (%s)",async(provider)=>{
    const id=randomUUID(),since=new Date().toISOString(),config=answerTestConfig(provider);
    await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,${JSON.stringify([{type:"paragraph",text:"QA: На 29 октомври общината одобри точно два проекта."}])}::jsonb,'/qa-two-stage/',published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const draft={status:"answered",blocks:[{text:"QA: Одобрени са два проекта.",evidence:["e0"]}],followUps:["Има ли публикувани документи?","Какво е известно за срока?"],timeSensitive:false};
    const values=[{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],answer:draft,needsResearch:false},{valid:true,factsValid:true,answerValid:true,invalidFollowUps:[],reason:""}];
    const network=vi.fn(async()=>Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(values.shift())}]}]}));vi.stubGlobal("fetch",network);
    try{
      const result=await answerSmartQuestion(db,config,await smartArticle(db,id),"QA: Колко проекта са одобрени?",[]);
      expect(result.status).toBe("answered");expect(result.sources).toHaveLength(1);expect(result.sources[0]!.articleId).toBe(id);expect(network).toHaveBeenCalledTimes(2);
      const rows=await db.execute(sql`select operation,status,article_id from ai_operations where article_id=${id}::uuid and started_at>=${since}::timestamptz order by started_at`);
      expect(rows.map(r=>r.operation)).toEqual(["retrieval","verification"]);expect(rows.every(r=>r.status==="known"&&r.article_id===id)).toBe(true);
    }finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${id}::uuid`);await db.execute(sql`delete from articles where id=${id}::uuid`);}
  });

  it.each(answerProviders.flatMap(provider=>[true,false].map(supported=>({provider,supported}))))("checks every one of fifteen valid evidence handles without a format rewrite ($provider, $supported)",async({provider,supported})=>{
    const id=randomUUID(),config=answerTestConfig(provider),now=new Date().toISOString();
    await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,'[]'::jsonb,'/qa-many-evidence-handles/',published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const passage=Array.from({length:30},(_,index)=>`QA: Лицето е живо. Документиран биографичен етап ${index}. ${`Допълнителен проверен факт за етап ${index}. `.repeat(7)}`).join("\n").trim();
    const source={id:"qa-many-facts",articleId:null,version:"qa",kind:"external" as const,title:"QA biography",url:"https://example.org/qa-biography",publishedAt:null,checkedAt:now,passage};
    const prior:SmartAnswer={status:"answered",blocks:[{text:"QA: Биографичният запис е наличен.",sourceIds:[source.id]}],sources:[source],followUps:[],checkedAt:now,expiresAt:new Date(Date.now()+60000).toISOString()};
    let writes=0,reviews=0,expectedQuotes:string[]=[];
    const network=vi.fn(async(_url:unknown,options:RequestInit)=>{
      const input=JSON.parse(JSON.parse(String(options.body)).input);
      let value:unknown;
      if(input.originalInput)throw Error("Valid fifteen-handle evidence must not cause a format repair");
      if(input.result){
        reviews++;const evidence=input.result.blocks[0].evidence;
        expect(evidence).toHaveLength(15);expect(evidence.map((item:any)=>item.quote)).toEqual(expectedQuotes);expect(evidence.every((item:any)=>item.sourceId===source.id)).toBe(true);
        expect(input.sources.find((item:any)=>item.id===source.id)?.passage).toBe(passage);
        value={valid:supported,factsValid:supported,answerValid:true,invalidFollowUps:[],reason:supported?"":"QA: the quoted record says alive, not deceased"};
      }else if(input.previous!==undefined){
        writes++;const evidence=input.sources.flatMap((item:any)=>item.passages).slice(0,15);
        expect(evidence).toHaveLength(15);expectedQuotes=evidence.map((item:any)=>item.text);
        value={status:"answered",blocks:[{text:supported?"QA: Лицето е живо; записът съдържа документирани биографични етапи.":"QA: Лицето е починало.",evidence:evidence.map((item:any)=>item.id)}],followUps:["Има ли други официални биографични записи?"],timeSensitive:false};
      }else value={queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],answer:null,needsResearch:false,evidenceSourceIds:["s1"]};
      return Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]});
    });vi.stubGlobal("fetch",network);
    try{
      const pending=answerSmartQuestion(db,config,await smartArticle(db,id),"QA: Какви факти съдържа биографичният запис?",[{question:"QA: Има ли биографичен запис?",answer:prior}]);
      if(supported){const result=await pending;expect(result.status).toBe("answered");expect(result.blocks[0]?.sourceIds).toEqual([source.id]);expect(result.sources[0]?.passage).toBe(passage);}
      else await expect(pending).rejects.toMatchObject({code:"evidence"});
      expect(writes).toBe(supported?1:2);expect(reviews).toBe(supported?1:2);expect(network).toHaveBeenCalledTimes(supported?3:5);
      const operations=await db.execute(sql`select operation from ai_operations where article_id=${id}::uuid`);
      expect(operations.map(row=>row.operation).sort()).toEqual(["answer_context","answer","verification",...(supported?[]:["answer_repair","verification"])].sort());
    }finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${id}::uuid`);await db.execute(sql`delete from articles where id=${id}::uuid`);}
  });

  it.each(answerProviders)("combines context assessment and drafting without a separate answer call (%s)",async(provider)=>{
    const config=answerTestConfig(provider),since=new Date().toISOString(),article=await smartArticle(db,articleId);
    const relatedId=randomUUID();await db.execute(sql`insert into articles select ${relatedId}::uuid,title,excerpt,${JSON.stringify([{type:"paragraph",text:"QAContextMergeTerm: explicit related QA evidence."}])}::jsonb,'/qa-related-context/',published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const draft={status:"answered",blocks:[{text:"QA: explicit related QA evidence.",evidence:["e0"]}],followUps:["Има ли публикувани документи?","Какво е известно за срока?"],timeSensitive:true};
    const values=[{queries:["QAContextMergeTerm","AnotherMissingQATerm456"],answer:null},{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],relevant:true,evidenceSourceIds:[],needsResearch:false,researchQuery:"",explanation:"",answer:draft},{valid:true,answerValid:true,reason:""}];
    const network=vi.fn(async()=>Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(values.shift())}]}]}));vi.stubGlobal("fetch",network);
    try{expect((await answerSmartQuestion(db,config,article,"QA contextual question",[])).status).toBe("answered");expect(network).toHaveBeenCalledTimes(3);const rows=await db.execute(sql`select operation from ai_operations where article_id=${articleId}::uuid and started_at>=${since}::timestamptz order by started_at`);expect(rows.map(r=>r.operation)).toEqual(["retrieval","answer_context","verification"]);}
    finally{vi.unstubAllGlobals();await db.execute(sql`delete from articles where id=${relatedId}::uuid`);await db.execute(sql`delete from ai_operations where article_id=${articleId}::uuid and started_at>=${since}::timestamptz`);}
  });
  it.each(answerProviders)("researches current proof after the reviewer rejects a complete-looking early draft (%s)",async(provider)=>{
    const id=randomUUID(),config=answerTestConfig(provider),url="https://example.org/qa-current-decision";
    const currentText="QA: На 10 октомври общината планира заседание.",externalText="QA: На 29 октомври общината проведе заседанието и прие решението.";
    await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,${JSON.stringify([{type:"paragraph",text:currentText}])}::jsonb,'/qa-current-proof/',published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const draft={status:"answered",blocks:[{text:currentText,evidence:["e0"]}],followUps:["Има ли публикуван протокол?"],timeSensitive:true};
    const values=[
      {queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],answer:draft,needsResearch:false},
      {valid:false,factsValid:true,answerValid:false,reason:"QA: old plans do not prove whether the meeting took place"},
      // An insufficient contextual draft must escalate even if its selector
      // mistakenly says no research: it cannot be published as the final answer.
      {relevant:true,evidenceSourceIds:["s0"],needsResearch:false,researchQuery:"QA current municipal decision",researchAlternative:"QA alternative decision",explanation:"",answer:{...draft,status:"insufficient",blocks:[{text:"QA: Тук липсва потвърждение.",evidence:[]}]}},
      {...draft,blocks:[{text:externalText,evidence:["e1"]}]},
      {valid:true,factsValid:true,answerValid:true,reason:""},
    ];
    const events:string[]=[],page=vi.spyOn(smartWeb,"fetchSmartPage").mockImplementation(async requested=>{expect(requested).toBe(url);events.push("page");return {url,text:externalText};});
    const network=vi.fn(async(requested:unknown,options:RequestInit)=>{
      const request=JSON.parse(String(options.body));
      if(String(requested).endsWith("/coding_plan/search")||request.tools){
        events.push("primary");const query=request.q??JSON.parse(request.input).question;expect(query).toBe("QA current municipal decision");
        return provider==="minimax"?Response.json({base_resp:{status_code:0},organic:[{title:"QA decision",link:url}]}):Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"web_search_call",status:"completed",action:{type:"search",sources:[{type:"url",url}]}}]});
      }
      const input=JSON.parse(request.input),value=values.shift();if(!value)throw Error("Unexpected extra provider call");
      if(input.result)events.push("review");
      if(input.critique&&input.previous===undefined){events.push("context");expect(input.critique).toContain("old plans");}
      return Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]});
    });vi.stubGlobal("fetch",network);
    try{
      const result=await answerSmartQuestion(db,config,await smartArticle(db,id),"QA: Проведено ли е заседанието?",[]);
      expect(result.status).toBe("answered");expect(result.blocks[0]?.text).toBe(externalText);expect(result.sources).toHaveLength(1);expect(result.sources[0]?.url).toBe(url);
      expect(events).toEqual(["review","context","primary","page","review"]);expect(network).toHaveBeenCalledTimes(6);
      const operations=await db.execute(sql`select operation from ai_operations where article_id=${id}::uuid order by started_at`);
      // PGlite can give adjacent operations the same started_at timestamp.
      // The strict events assertion above proves execution order; the ledger
      // independently proves every operation was charged exactly once.
      expect(operations.map(row=>row.operation).sort()).toEqual(["retrieval","verification","answer_context",provider==="minimax"?"research_search":"research","answer_repair","verification"].sort());
    }finally{page.mockRestore();vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${id}::uuid`);await db.execute(sql`delete from articles where id=${id}::uuid`);}
  });

  it.each(answerProviders)("requires explicit fact and coverage approval before publishing an early draft (%s)",async(provider)=>{
    const id=randomUUID(),config=answerTestConfig(provider),text="QA: Общината одобри два проекта.";
    await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,${JSON.stringify([{type:"paragraph",text}])}::jsonb,'/qa-explicit-review/',published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const draft={status:"answered",blocks:[{text,evidence:["e0"]}],followUps:["Има ли публикувано решение?"],timeSensitive:false};
    const values=[{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],answer:draft,needsResearch:false},{valid:true,reason:""},{relevant:true,evidenceSourceIds:["s0"],needsResearch:false,researchQuery:"",explanation:"",answer:draft},{valid:true,factsValid:true,answerValid:true,reason:""}];
    const network=vi.fn(async()=>{const value=values.shift();if(!value)throw Error("Unexpected provider call");return Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]});});vi.stubGlobal("fetch",network);
    try{expect((await answerSmartQuestion(db,config,await smartArticle(db,id),"QA: Колко проекта са одобрени?",[])).status).toBe("answered");expect(network).toHaveBeenCalledTimes(4);}
    finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${id}::uuid`);await db.execute(sql`delete from articles where id=${id}::uuid`);}
  });

  it.each(answerProviders)("does not accept a current-only expansion merely because history has an external source (%s)",async(provider)=>{
    const id=randomUUID(),config=answerTestConfig(provider),url="https://example.org/qa-expanded-proof",now=new Date().toISOString();
    const text="QA: Общината одобри проекта.",detail="QA: Комисията контролира изпълнението на проекта чрез месечни отчети.";
    await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,${JSON.stringify([{type:"paragraph",text}])}::jsonb,'/qa-expansion-proof/',published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const source={id:"qa-prior-proof",articleId:null,version:"qa",kind:"external" as const,title:"QA prior source",url:"https://example.org/qa-prior",publishedAt:null,checkedAt:now,passage:"QA: По-рано общината обсъждаше бюджета на проекта."};
    const prior:SmartAnswer={status:"answered",blocks:[{text:source.passage,sourceIds:[source.id]}],sources:[source],followUps:[],checkedAt:now,expiresAt:new Date(Date.now()+60000).toISOString()};
    const draft={status:"answered",blocks:[{text,evidence:["e0"]}],followUps:["Има ли публикувано решение?"],timeSensitive:false};
    const values=[{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],answer:draft,needsResearch:false,evidenceSourceIds:["s0"],researchQuery:"QA project supervision"},{...draft,blocks:[{text:detail,evidence:["e1"]}]},{valid:true,factsValid:true,answerValid:true,reason:""}];
    const page=vi.spyOn(smartWeb,"fetchSmartPage").mockResolvedValue({url,text:detail});
    let searches=0,reviews=0;
    const network=vi.fn(async(requested:unknown,options:RequestInit)=>{
      const request=JSON.parse(String(options.body));
      if(String(requested).endsWith("/coding_plan/search")||request.tools){
        searches++;return provider==="minimax"?Response.json({base_resp:{status_code:0},organic:[{title:"QA details",link:url}]}):Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"web_search_call",status:"completed",action:{type:"search",sources:[{type:"url",url}]}}]});
      }
      const input=JSON.parse(request.input);if(input.result){reviews++;expect(input.requireExpansion).toBe(true);expect(input.result.blocks[0].text).toBe(detail);}
      const value=values.shift();if(!value)throw Error("Unexpected provider call");return Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]});
    });vi.stubGlobal("fetch",network);
    try{
      const result=await answerSmartQuestion(db,config,await smartArticle(db,id),"QA: Как се контролира изпълнението?",[{question:"QA previous budget",answer:prior}],{requireExpansion:true});
      expect(result.status).toBe("answered");expect(result.blocks[0]?.text).toBe(detail);expect(result.sources[0]?.url).toBe(url);expect(searches).toBe(1);expect(reviews).toBe(1);expect(network).toHaveBeenCalledTimes(4);
    }finally{page.mockRestore();vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${id}::uuid`);await db.execute(sql`delete from articles where id=${id}::uuid`);}
  });

  it("never salvages factually correct but insufficient current information by dropping a suggestion",async()=>{
    const config=smartConfig({MINIMAX_API_KEY:"qa-insufficient-context-key"}),article=await smartArticle(db,articleId),since=new Date().toISOString();
    const relatedId=randomUUID();await db.execute(sql`insert into articles select ${relatedId}::uuid,title,excerpt,${JSON.stringify([{type:"paragraph",text:"QAInsufficientContextTerm: explicit related QA evidence."}])}::jsonb,'/qa-related-context/',published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const draft={status:"insufficient",blocks:[{text:"QA: Стари данни.",evidence:[]}],followUps:["Кога предстои непотвърденото събитие?","Има ли нови документи?","Какво е известно за периода?"],timeSensitive:true};
    const review={valid:false,factsValid:true,answerValid:false,invalidFollowUps:[0],reason:"QA: current information missing"};
    const values=[{queries:["QAInsufficientContextTerm","AnotherMissingQATerm456"]},{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],relevant:true,evidenceSourceIds:[],needsResearch:false,researchQuery:"",explanation:"",answer:draft},{base_resp:{status_code:0},organic:[]},draft,review,draft,review];
    const network=vi.fn(async(url:unknown)=>{const value=values.shift();return String(url).endsWith("/coding_plan/search")?Response.json(value):Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]});});vi.stubGlobal("fetch",network);
    try{await expect(answerSmartQuestion(db,config,article,"QA latest development",[])).rejects.toMatchObject({code:"evidence"});expect(network).toHaveBeenCalledTimes(7);}
    finally{vi.unstubAllGlobals();await db.execute(sql`delete from articles where id=${relatedId}::uuid`);await db.execute(sql`delete from ai_operations where article_id=${articleId}::uuid and started_at>=${since}::timestamptz`);}
  });
  it("recovers interrupted jobs in one database statement without expiring active operations",async()=>{
    const old=await startAiOperation(db,{module:"smart",provider:"minimax",model:"QA",operation:"QA_recovery"});
    const active=await startAiOperation(db,{module:"smart",provider:"minimax",model:"QA",operation:"QA_recovery"});
    await db.execute(sql`update ai_operations set started_at=now()-interval '11 minutes' where id=${old}::uuid`);
    try{await recoverSmartJobs(db);const rows=await db.execute(sql`select id,status from ai_operations where id in (${old}::uuid,${active}::uuid)`);expect(rows.find(r=>r.id===old)?.status).toBe("unknown");expect(rows.find(r=>r.id===active)?.status).toBe("pending");}
    finally{await db.execute(sql`delete from ai_operations where id in (${old}::uuid,${active}::uuid)`);}
  });

  it.each(answerProviders.flatMap(provider=>["approve","reject","duplicate","invalid_index","revision"].map(mode=>({provider,mode}))))("repairs only rejected continuations after facts are approved ($provider, $mode)",async({provider,mode})=>{
    const id=randomUUID(),relatedId=randomUUID(),config=answerTestConfig(provider);
    const text="QA: Общината одобри точно два проекта.",relatedText="QAFollowupRepairTerm: Общината публикува решенията на съвета в публичен регистър.";
    for(const [articleKey,passage,path] of [[id,text,"/qa-followup-only/"],[relatedId,relatedText,"/qa-followup-context/"]])await db.execute(sql`insert into articles select ${articleKey}::uuid,title,excerpt,${JSON.stringify([{type:"paragraph",text:passage}])}::jsonb,${path},published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const article=await smartArticle(db,id),question="QA: Колко проекта са одобрени?";
    const initialQuestions=["Каква е стойността на проектите?","Има ли официални документи за финансирането?","Какви са сроковете за изпълнение?"];
    await db.execute(sql`insert into smart_bootstraps(article_id,revision,state,payload,sources,expires_at) values(${id}::uuid,${article.revision},'ready',${JSON.stringify({questions:initialQuestions.map((text,index)=>({id:`qa-${index}`,text}))})}::jsonb,'[]'::jsonb,now()+interval '1 day')`);
    const prior:SmartAnswer={status:"answered",blocks:[{text:"QA: Предишен проверен контекст.",sourceIds:[]}],sources:[],followUps:[],checkedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
    const history=[{question:"QA: Предишен въпрос по тази история?",answer:prior}];
    const rejected=["Защо общината отмени одобрените проекти?","Кога ще започне гарантираното разследване?"];
    const replacements=mode==="duplicate"?[question,initialQuestions[0]!]:[mode==="invalid_index"?question:"Има ли данни кой контролира изпълнението?","Къде се публикуват решенията на общинския съвет?"];
    const draft={status:"answered",blocks:[{text,evidence:["e0"]}],followUps:rejected,timeSensitive:false};
    const values:any[]=[{queries:["QAFollowupRepairTerm","NoMatchingQATerm123"],answer:draft,needsResearch:false},{valid:false,factsValid:true,answerValid:true,invalidFollowUps:[0,1],approvedFallbacks:[],relatedArticles:[{index:1,quote:relatedText}],reason:"QA: both questions assume unsupported developments"},{followUps:replacements},{approvedIndices:mode==="reject"?[]:[mode==="invalid_index"?0:1],reason:"QA: independent question review"}];
    let questionReviews=0;
    const network=vi.fn(async(_url:unknown,options:RequestInit)=>{
      const request=JSON.parse(String(options.body)),input=JSON.parse(request.input);
      if(input.rejectedFollowUps){
        expect(input.answer).toEqual([text]);expect(input.question).toBe(question);expect(input.initialQuestions).toEqual(initialQuestions);
        expect(input.history).toEqual([{question:history[0]!.question,answer:prior.blocks[0]!.text}]);expect(JSON.stringify(input.sources)).toContain(relatedText);expect(JSON.stringify(input.sources)).toContain(text);
        expect(input.sources.map((source:any)=>source.articleId)).toEqual([id,relatedId]);
      }
      if(input.followUps){questionReviews++;expect(input.followUps).toEqual(replacements);if(mode==="revision")await db.execute(sql`update articles set published_revision=published_revision+1 where id=${id}::uuid`);}
      const value=values.shift();if(!value)throw Error("Unexpected extra provider request");return Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]});
    });vi.stubGlobal("fetch",network);
    try{
      const pending=answerSmartQuestion(db,config,article,question,history);
      if(mode==="approve"){
        const result=await pending;expect(result.blocks).toEqual([{text,sourceIds:[result.sources.find(source=>source.articleId===id)!.id]}]);expect(result.followUps.map(item=>item.text)).toEqual([replacements[1]]);expect(result.relatedArticleIds).toEqual([relatedId]);
      }else await expect(pending).rejects.toMatchObject({code:"evidence"});
      expect(network).toHaveBeenCalledTimes(mode==="duplicate"?3:4);expect(questionReviews).toBe(mode==="duplicate"?0:1);
      const operations=await db.execute(sql`select operation from ai_operations where article_id=${id}::uuid`);
      expect(operations.map(row=>row.operation).sort()).toEqual(["retrieval","verification","followup_repair",...(mode==="duplicate"?[]:["followup_verification"])].sort());
    }finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${id}::uuid`);await db.execute(sql`delete from articles where id in (${id}::uuid,${relatedId}::uuid)`);}
  });

  it.each(answerProviders.flatMap(provider=>[
    {provider,factsValid:true,answerValid:true},
    {provider,factsValid:false,answerValid:true},
    {provider,factsValid:true,answerValid:false},
  ]))("uses fallback questions only with independent facts and coverage approval ($provider, $factsValid, $answerValid)",async({provider,factsValid,answerValid})=>{
    const id=randomUUID(),config=answerTestConfig(provider);
    await db.execute(sql`insert into articles select ${id}::uuid,title,excerpt,${JSON.stringify([{type:"paragraph",text:"QA: На 29 октомври общината одобри два проекта."}])}::jsonb,'/qa-verified-fallback/',published_revision,source_modified_at,true,published_at,updated_at from articles where id=${articleId}::uuid`);
    const article=await smartArticle(db,id),question="QA: Колко проекта са одобрени?";
    const questions=[question,"Има ли публикувани документи по проектите?","Какво е известно за изпълнението?"];
    const payload={status:"ready",articleId:id,version:article.revision,questions:questions.map((text,index)=>({id:`qa-${index}`,text})),related:null};
    await db.execute(sql`insert into smart_bootstraps(article_id,revision,state,payload,sources,expires_at) values(${id}::uuid,${article.revision},'ready',${JSON.stringify(payload)}::jsonb,'[]'::jsonb,now()+interval '1 day')`);
    const reserve=["Кой контролира изпълнението на проектите?","Има ли достъпни решения на комисията?"];
    const history=[{question:"QA prior context",answer:{status:"answered" as const,blocks:[],sources:[],followUps:reserve.map((text,index)=>({id:`reserve-${index}`,text})),checkedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()}}];
    const draft={status:"answered",blocks:[{text:factsValid?"QA: Одобрени са два проекта.":"QA: Одобрени са двеста проекта.",evidence:["e0"]}],followUps:[question,"QA: Кои точно два проекта са одобрени?"],timeSensitive:false};
    const accepted=factsValid&&answerValid;
    const review={valid:false,factsValid,answerValid,invalidFollowUps:[0,1],approvedFallbacks:[0,1],reason:"QA: duplicate suggestions"};
    const values:any[]=[{queries:["NoMatchingQATerm123","AnotherMissingQATerm456"],answer:draft,needsResearch:false},review,...(accepted?[]:[{relevant:true,evidenceSourceIds:["s0"],needsResearch:false,researchQuery:"",explanation:"",answer:draft},review])];
    const network=vi.fn(async()=>Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(values.shift())}]}]}));
    vi.stubGlobal("fetch",network);
    try{
      if(accepted){const result=await answerSmartQuestion(db,config,article,question,history);expect(result.blocks[0]?.text).toBe(draft.blocks[0]!.text);expect(result.followUps.map(q=>q.text)).toEqual(reserve.slice(0,1));expect(network).toHaveBeenCalledTimes(2);}
      else {await expect(answerSmartQuestion(db,config,article,question,history)).rejects.toMatchObject({code:"evidence"});expect(network).toHaveBeenCalledTimes(4);const operations=await db.execute(sql`select operation from ai_operations where article_id=${id}::uuid`);expect(operations.some(row=>String(row.operation).startsWith("followup_"))).toBe(false);}
    }finally{vi.unstubAllGlobals();await db.execute(sql`delete from ai_operations where article_id=${id}::uuid`);await db.execute(sql`delete from articles where id=${id}::uuid`);}
  });
  it("replaces an expired reservation and does not count an off-topic completion",async()=>{
    const sessionId=await openSmartSession(db,articleId,"qa-expiry-batch");
    const old=await reserveSmartTurn(db,"qa-expiry-batch",{sessionId,requestKey:randomUUID(),question:"QA expired"});
    await db.execute(sql`update smart_turns set lease_until=now()-interval '1 minute' where id=${String(old.id)}::uuid`);
    const next=await reserveSmartTurn(db,"qa-expiry-batch",{sessionId,requestKey:randomUUID(),question:"QA unrelated"});
    expect((await db.execute(sql`select status from smart_turns where id=${String(old.id)}::uuid`))[0]?.status).toBe("failed");
    await finishSmartTurn(db,String(next.id),{...answer,status:"off_topic"},false,null);
    expect((await readSmartSession(db,sessionId,"qa-expiry-batch")).usedQuestions).toBe(0);
  });

  it.each(answerProviders)("shows an omitted newer candidate to the reviewer and allows a supported repair from it (%s)",async(provider)=>{
    const id=randomUUID(),other=randomUUID(),config=answerTestConfig(provider);
    for(const [articleKey,text,path,age] of [[id,"QAReviewConflictTerm: срокът е 10 дни.","/qa-old-deadline/","2 days"],[other,"QAReviewConflictTerm: срокът е отменен.","/qa-new-deadline/","1 day"]])await db.execute(sql`insert into articles select ${articleKey}::uuid,title,excerpt,${JSON.stringify([{type:"paragraph",text}])}::jsonb,${path},published_revision,source_modified_at,true,now()-${age}::interval,updated_at from articles where id=${articleId}::uuid`);
    const followUps=["Има ли публикуван акт?","Какво е известно за следващите действия?"];
    const draft={status:"answered",blocks:[{text:"QA: Срокът е 10 дни.",evidence:["e0"]}],followUps,timeSensitive:true};
    const repaired={...draft,blocks:[{text:"QA: Срокът е отменен.",evidence:["e1"]}]};
    const values=[{queries:["QAReviewConflictTerm","NoMatchingQATerm123"],answer:draft,needsResearch:false},{valid:false,factsValid:false,answerValid:false,reason:"QA: newer source cancels the deadline"},{relevant:true,evidenceSourceIds:["s1"],needsResearch:false,researchQuery:"",explanation:"",answer:repaired},{valid:true,factsValid:true,answerValid:true,reason:""}];
    let reviews=0;
    const network=vi.fn(async(_url:unknown,options:RequestInit)=>{const request=JSON.parse(String(options.body)),input=JSON.parse(request.input);if(input.result){reviews++;expect(input.sources.some((source:any)=>source.articleId===other)).toBe(true);}return Response.json({id:randomUUID(),model:config.model,status:"completed",usage:{input_tokens:10,output_tokens:10},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(values.shift())}]}]});});vi.stubGlobal("fetch",network);
    try{const result=await answerSmartQuestion(db,config,await smartArticle(db,id),"QA: Валиден ли е срокът?",[]);expect(result.blocks[0]?.text).toBe("QA: Срокът е отменен.");expect(result.sources[0]?.articleId).toBe(other);expect(reviews).toBe(2);expect(network).toHaveBeenCalledTimes(4);}
    finally{vi.unstubAllGlobals();for(const articleKey of [id,other]){await db.execute(sql`delete from ai_operations where article_id=${articleKey}::uuid`);await db.execute(sql`delete from articles where id=${articleKey}::uuid`);}}
  });

});
