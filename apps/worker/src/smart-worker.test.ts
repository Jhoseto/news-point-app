import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {sql,type SQL} from "drizzle-orm";
import {PgDialect} from "drizzle-orm/pg-core";
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import type {SmartDb} from "@newspoint/db/smart";
const mocks=vi.hoisted(()=>({config:vi.fn(),ask:vi.fn(),prepare:vi.fn(),article:vi.fn(),prune:vi.fn()}));
vi.mock("@newspoint/db/smart-settings",()=>({readSmartRuntimeConfig:mocks.config}));
vi.mock("@newspoint/db/smart-service",()=>({askSmart:mocks.ask,prepareSmartArticle:mocks.prepare}));
vi.mock("@newspoint/db/smart",async original=>({...await original<typeof import("@newspoint/db/smart")>(),smartReady:async()=>true,smartArticle:mocks.article,pruneSmartPrivateData:mocks.prune}));
import {processSmartTick,startSmartWorker} from "./smart-worker";
let pg:PGlite,db:SmartDb,sequence=0;
const stops:(()=>Promise<void>)[]=[];
const releases=new Set<()=>void>();
function gate(){let done!:()=>void;const promise=new Promise<void>(resolve=>{done=resolve;});const resolve=()=>{releases.delete(resolve);done();};releases.add(resolve);return {promise,resolve};}
beforeAll(async()=>{
 pg=new PGlite();const raw=drizzle(pg);db={execute:async(query:SQL)=>(await raw.execute(query)).rows} as unknown as SmartDb;
 await pg.exec(`
 create table smart_sessions(id uuid primary key,article_id uuid,owner_hash text,deleted_at timestamptz,expires_at timestamptz);
 create table smart_turns(id uuid primary key,session_id uuid,request_key uuid,question text,question_id uuid,parent_key text,status text,processor_token uuid,lease_until timestamptz,created_at timestamptz default now(),error_code text);
 create table smart_nodes(key text,state text,lease_until timestamptz);
 create table smart_bootstraps(article_id uuid primary key,revision text,state text,lease_token uuid,lease_until timestamptz,updated_at timestamptz default now(),payload jsonb,sources jsonb,expires_at timestamptz);
 create table smart_public_articles(id uuid primary key);
 create table smart_index_jobs(article_id uuid,state text,lease_token uuid,lease_until timestamptz);
 create table ai_operations(id uuid,status text,error_code text,started_at timestamptz,finished_at timestamptz);
 `);
});
beforeEach(async()=>{
 vi.resetAllMocks();sequence=0;mocks.config.mockResolvedValue({enabled:true,key:"explicit-offline-fixture",provider:"minimax"});
 mocks.article.mockImplementation(async(_db,id)=>({id,revision:"qa-revision"}));mocks.prepare.mockResolvedValue({payload:{},sources:[]});
 mocks.prune.mockResolvedValue(undefined);
 await pg.exec("truncate smart_turns,smart_sessions,smart_nodes,smart_bootstraps,smart_public_articles,smart_index_jobs,ai_operations");
});
afterEach(async()=>{for(const release of releases)release();await Promise.all(stops.splice(0).map(stop=>stop()));vi.useRealTimers();});
afterAll(async()=>{await pg.close();});
async function queued(article=randomUUID()){
 const session=randomUUID(),id=randomUUID(),request=randomUUID();
 await db.execute(sql`insert into smart_sessions values(${session}::uuid,${article}::uuid,'offline-owner',null,now()+interval '1 hour')`);
 // Explicit queue order: adjacent PGlite statements can share the same now().
 const createdAt=new Date(Date.now()-60_000+sequence++).toISOString();
 await db.execute(sql`insert into smart_turns(id,session_id,request_key,question,status,lease_until,created_at) values(${id}::uuid,${session}::uuid,${request}::uuid,'Explicit offline fixture','pending',now()+interval '10 minutes',${createdAt}::timestamptz)`);
 return {article,session,id,request};
}
describe("Smart worker bounded article lanes (offline)",()=>{
 it("only enters one handler when two stale selections return the same article",async()=>{
  const turn=await queued();await queued(turn.article);const selected=gate(),answer=gate();let reads=0;
  const raced={execute:async(query:SQL)=>{
   const result=await db.execute(query);
   if(new PgDialect().sqlToQuery(query).sql.includes("queued_article_id")){if(++reads===2)selected.resolve();await selected.promise;}
   return result;
  }} as SmartDb;
  const active=new Set<string>();mocks.ask.mockImplementation(async()=>{await answer.promise;});
  const first=processSmartTick(raced,active),second=processSmartTick(raced,active);
  await vi.waitFor(()=>expect(mocks.ask).toHaveBeenCalledTimes(1));expect(active.has(turn.article)).toBe(true);
  answer.resolve();expect((await Promise.all([first,second])).sort()).toEqual([false,true]);expect(active.size).toBe(0);
  expect((await db.execute(sql`select status from smart_turns where id=${turn.id}::uuid`))[0]?.status).toBe("pending");
 });
 it("runs at most two distinct articles and starts queued work after a slot frees",async()=>{
  vi.useFakeTimers({toFake:["setInterval","clearInterval"]});
  const jobs=[await queued(),await queued(),await queued()];const controls=new Map(jobs.map(job=>[job.session,gate()]));
  let live=0,maximum=0;
  mocks.ask.mockImplementation(async(_db,_config,_owner,input)=>{
   live++;maximum=Math.max(maximum,live);await controls.get(input.sessionId)!.promise;
   await db.execute(sql`update smart_turns set status='completed' where session_id=${input.sessionId}::uuid`);live--;
  });
  const stop=startSmartWorker(db,vi.fn());stops.push(stop);
  await vi.waitFor(()=>expect(mocks.ask).toHaveBeenCalledTimes(1));await vi.advanceTimersByTimeAsync(1000);
  await vi.waitFor(()=>expect(mocks.ask).toHaveBeenCalledTimes(2));await vi.advanceTimersByTimeAsync(5000);
  expect(mocks.ask).toHaveBeenCalledTimes(2);expect(maximum).toBe(2);
  controls.get(jobs[0]!.session)!.resolve();await vi.waitFor(()=>expect(live).toBe(1));await vi.advanceTimersByTimeAsync(1000);
  await vi.waitFor(()=>expect(mocks.ask).toHaveBeenCalledTimes(3));expect(maximum).toBe(2);
  const stopping=stop();for(const control of controls.values())control.resolve();await stopping;expect(live).toBe(0);
  await queued();await vi.advanceTimersByTimeAsync(5000);expect(mocks.ask).toHaveBeenCalledTimes(3);
 });
 it("does not process a reader on an article currently being prepared in the other lane",async()=>{
  const article=randomUUID(),active=new Set<string>(),preparing=gate();
  await db.execute(sql`insert into smart_public_articles values(${article}::uuid)`);
  await db.execute(sql`insert into smart_bootstraps(article_id,revision,state) values(${article}::uuid,'qa-revision','pending')`);
  mocks.prepare.mockImplementation(async()=>{await preparing.promise;return {payload:{},sources:[]};});
  const bootstrap=processSmartTick(db,active);await vi.waitFor(()=>expect(mocks.prepare).toHaveBeenCalledTimes(1));
  await queued(article);const other=await queued();mocks.ask.mockResolvedValue(undefined);
  expect(await processSmartTick(db,active)).toBe(true);expect(mocks.ask.mock.calls[0]![3].sessionId).toBe(other.session);expect(mocks.prepare).toHaveBeenCalledTimes(1);
  preparing.resolve();await bootstrap;expect(active.size).toBe(0);
 });
 it("skips database-owned article work even when it is absent from the local set",async()=>{
  const claimed=await queued(),waiting=await queued(claimed.article),preparing=await queued(),eligible=await queued();
  await db.execute(sql`update smart_turns set processor_token=${randomUUID()}::uuid where id=${claimed.id}::uuid`);
  await db.execute(sql`insert into smart_bootstraps(article_id,revision,state,lease_token,lease_until) values(${preparing.article}::uuid,'qa','pending',${randomUUID()}::uuid,now()+interval '1 minute')`);
  mocks.ask.mockResolvedValue(undefined);expect(await processSmartTick(db,new Set())).toBe(true);
  expect(mocks.ask).toHaveBeenCalledTimes(1);expect(mocks.ask.mock.calls[0]![3].sessionId).toBe(eligible.session);expect(waiting.session).not.toBe(eligible.session);
 });
 it.each([{enabled:false,key:"qa"},{enabled:true,key:""}])("does no queued work while unavailable: %j",async(config)=>{
  await queued();mocks.config.mockResolvedValue(config);expect(await processSmartTick(db,new Set())).toBe(false);expect(mocks.ask).not.toHaveBeenCalled();expect(mocks.prepare).not.toHaveBeenCalled();
 });
 it("releases the article lane after a rejected turn without retrying that turn",async()=>{
  const failed=await queued(),other=await queued(),active=new Set<string>();
  mocks.ask.mockRejectedValueOnce(new Error("Explicit quota rejection")).mockResolvedValueOnce(undefined);
  expect(await processSmartTick(db,active)).toBe(true);expect(active.size).toBe(0);
  expect((await db.execute(sql`select status,error_code from smart_turns where id=${failed.id}::uuid`))[0]).toMatchObject({status:"failed",error_code:"Error"});
  expect(await processSmartTick(db,active)).toBe(true);expect(mocks.ask).toHaveBeenCalledTimes(2);expect(mocks.ask.mock.calls[1]![3].sessionId).toBe(other.session);
 });
 it("stops new dispatch and waits for active answers and privacy maintenance before closing",async()=>{
  vi.useFakeTimers({toFake:["setInterval","clearInterval"]});
  const turn=await queued(),answer=gate(),maintenance=gate();
  mocks.prune.mockImplementation(async()=>{await maintenance.promise;});
  mocks.ask.mockImplementation(async()=>{await answer.promise;await db.execute(sql`update smart_turns set status='completed' where id=${turn.id}::uuid`);});
  const stop=startSmartWorker(db,vi.fn());stops.push(stop);
  await vi.waitFor(()=>{expect(mocks.ask).toHaveBeenCalledTimes(1);expect(mocks.prune).toHaveBeenCalledTimes(1);});
  let closed=false;const stopping=stop().then(()=>{closed=true;});await Promise.resolve();expect(closed).toBe(false);
  await queued();await vi.advanceTimersByTimeAsync(5000);expect(mocks.ask).toHaveBeenCalledTimes(1);
  answer.resolve();await vi.waitFor(async()=>expect((await db.execute(sql`select status from smart_turns where id=${turn.id}::uuid`))[0]?.status).toBe("completed"));
  expect(closed).toBe(false);maintenance.resolve();await stopping;expect(closed).toBe(true);expect(vi.getTimerCount()).toBe(0);
 });
 it.each(["pending","failed"])("does not overwrite a claimed turn's %s state after a stale handler error",async(status)=>{
  const turn=await queued(),token=randomUUID();
  mocks.ask.mockImplementation(async()=>{
   await db.execute(sql`update smart_turns set processor_token=${token}::uuid,status=${status},error_code='existing-owner-state' where id=${turn.id}::uuid`);
   throw new Error("A stale handler rejected before acquiring ownership");
  });
  expect(await processSmartTick(db,new Set())).toBe(true);
  expect((await db.execute(sql`select status,processor_token,error_code from smart_turns where id=${turn.id}::uuid`))[0]).toMatchObject({status,processor_token:token,error_code:"existing-owner-state"});
  expect(await processSmartTick(db,new Set())).toBe(false);expect(mocks.ask).toHaveBeenCalledTimes(1);
 });
});
