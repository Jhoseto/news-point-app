import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { askSmart, prepareSmartArticle } from "@newspoint/db/smart-service";
import { readSmartRuntimeConfig } from "@newspoint/db/smart-settings";
import { pruneSmartPrivateData, smartArticle, smartReady, SmartError, type SmartDb } from "@newspoint/db/smart";

export async function recoverSmartJobs(db:SmartDb){
  // One SSH/database round trip. Every data-modifying CTE runs even when empty.
  await db.execute(sql`with turns as (
    update smart_turns set status='failed',error_code='expired' where status='pending' and lease_until<=now() returning id
  ), nodes as (
    update smart_nodes set state='uncertain' where state='pending' and lease_until<=now() returning key
  ), bootstraps as (
    update smart_bootstraps set state='uncertain' where state='pending' and lease_until is not null and lease_until<=now() returning article_id
  ), operations as (
    update ai_operations set status='unknown',error_code='process_interrupted' where status='pending' and started_at<now()-interval '10 minutes' returning id
  ), jobs as (
    update smart_index_jobs set state='uncertain' where state='pending' and lease_until<=now() returning article_id
  ) select 1`);
}
export async function processSmartTick(db:SmartDb,inFlightArticles=new Set<string>()) {
  const config=await readSmartRuntimeConfig(db);
  if(!config.enabled||!config.key||!await smartReady(db))return false;
  await recoverSmartJobs(db);
  const skipped=JSON.stringify([...inFlightArticles]);
  const turns=await db.execute(sql`select t.*,s.owner_hash,s.article_id as queued_article_id from smart_turns t join smart_sessions s on s.id=t.session_id
    where t.status='pending' and t.processor_token is null and t.lease_until>now() and s.deleted_at is null and s.expires_at>now()
      and not exists(select 1 from jsonb_array_elements_text(${skipped}::jsonb) ignored(id) where ignored.id::uuid=s.article_id)
      and not exists(select 1 from smart_turns active join smart_sessions owner on owner.id=active.session_id
        where owner.article_id=s.article_id and active.status='pending' and active.processor_token is not null and active.lease_until>now())
      and not exists(select 1 from smart_bootstraps b where b.article_id=s.article_id and b.state='pending' and b.lease_token is not null and b.lease_until>now())
    order by t.created_at limit 1`);
  if(turns[0]) {
    const t=turns[0],articleId=String(t.queued_article_id);
    // Claim locally without an await between the check and add. Two lanes may
    // have selected the same article from an earlier snapshot; only one enters
    // askSmart. The database retains the actual turn/node ownership checks.
    if(inFlightArticles.has(articleId))return false;
    inFlightArticles.add(articleId);
    try {await askSmart(db,config,String(t.owner_hash),{sessionId:String(t.session_id),requestKey:String(t.request_key),question:String(t.question),questionId:t.question_id?String(t.question_id):undefined,parentKey:t.parent_key?String(t.parent_key):undefined});}
    catch(error){
      // askSmart owns failure handling after it claims the turn. A validation
      // error before that claim must not cancel a different process's owner.
      await db.execute(sql`update smart_turns set status='failed',error_code=${error instanceof Error?error.name:"failed"}
        where id=${t.id as string}::uuid and status='pending' and processor_token is null`);
    }
    finally{inFlightArticles.delete(articleId);}
    return true;
  }
  const pending=await db.execute(sql`select b.article_id from smart_bootstraps b join smart_public_articles a on a.id=b.article_id
    where b.state='pending' and b.lease_token is null
      and not exists(select 1 from jsonb_array_elements_text(${skipped}::jsonb) ignored(id) where ignored.id::uuid=b.article_id)
      and not exists(select 1 from smart_turns active join smart_sessions owner on owner.id=active.session_id
        where owner.article_id=b.article_id and active.status='pending' and active.processor_token is not null and active.lease_until>now())
    order by b.updated_at limit 1`);
  const target=pending[0]?.article_id?String(pending[0].article_id):null;
  if(!target)return false;
  if(inFlightArticles.has(target))return false;
  inFlightArticles.add(target);
  // Lease the requested preparation before any paid work, across worker processes.
  const token=randomUUID();
  let acquired=false;
  try {
    const claimed=await db.execute(sql`update smart_bootstraps set lease_token=${token}::uuid,lease_until=now()+interval '10 minutes' where article_id=${target}::uuid and state='pending' and lease_token is null returning article_id`);
    if(!claimed.length)return true;
    acquired=true;
    const article=await smartArticle(db,target);
    if(pending[0]) {
      const prepared=await prepareSmartArticle(db,config,article);
      await db.execute(sql`update smart_bootstraps set payload=${JSON.stringify(prepared.payload)}::jsonb,sources=${JSON.stringify(prepared.sources)}::jsonb,state='ready',expires_at=now()+interval '24 hours',lease_token=null,lease_until=null,updated_at=now()
        where article_id=${target}::uuid and revision=${article.revision} and lease_token=${token}::uuid and lease_until>now()`);
    }
  }catch(error){
    await db.execute(sql`update smart_index_jobs set state='uncertain' where article_id=${target}::uuid and lease_token=${token}::uuid and state='pending'`);
    if(acquired)await db.execute(sql`update smart_bootstraps set state='uncertain',lease_token=null,lease_until=null,updated_at=now() where article_id=${target}::uuid and lease_token=${token}::uuid`);
    throw error;
  }finally{inFlightArticles.delete(target);}
  return true;
}
export function startSmartWorker(db:SmartDb,log:(message:string)=>void) {
  // One supervised process, two independent articles at a time. This is a
  // throughput bound, not speculative work or additional provider attempts.
  const inFlightArticles=new Set<string>();
  const active=new Set<Promise<void>>();
  let stopped=false,pruning:Promise<void>|null=null;
  const safeError=(error:unknown)=>error instanceof SmartError?error.code:error instanceof Error?error.name:"failed";
  const tick=()=>{
    if(stopped||active.size>=2)return;
    const task=(async()=>{try{await processSmartTick(db,inFlightArticles);}catch(error){log(`Smart: ${safeError(error)}`);}})();
    active.add(task);void task.then(()=>active.delete(task),()=>active.delete(task));
  };
  // Privacy maintenance continues when model access or the public feature is disabled.
  const prune=()=>{
    if(stopped||pruning)return;
    pruning=(async()=>{try{if(await smartReady(db))await pruneSmartPrivateData(db);}catch(error){log(`Smart maintenance: ${safeError(error)}`);}})();
    const finished=()=>{pruning=null;};void pruning.then(finished,finished);
  };
  const maintenance=setInterval(()=>void prune(),60*60_000);void prune();
  const dispatch=()=>{void tick();void tick();};
  const timer=setInterval(dispatch,1000);dispatch();
  return async()=>{
    stopped=true;clearInterval(timer);clearInterval(maintenance);
    await Promise.allSettled([...active,...(pruning?[pruning]:[])]);
  };
}
