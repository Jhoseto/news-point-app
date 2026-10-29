import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { SMART_PROMPT_VERSION,SMART_QUESTION_LIMIT,SMART_QUESTION_COOLDOWN_SECONDS, type SmartAnswer, type SmartBootstrap, type SmartSource,type SmartTurn } from "@newspoint/content/smart";
import type { ScriptDb } from "./node";
import {publicSmartBootstrap} from "./smart-preparation";

/** Shared by Next routes and the Node worker; do not mark server-only. */
export type SmartDb = Pick<ScriptDb, "execute" | "transaction">;
export class SmartError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
export const smartHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function smartReady(db: SmartDb) {
  const rows = await db.execute(sql`select to_regclass('public.smart_sessions') is not null as ready`);
  return rows[0]?.ready === true;
}
export type SmartArticle = { id: string; title: string; path: string; excerpt: string; body: unknown; revision: string; publishedAt: string; updatedAt: string };
export async function smartArticle(db: SmartDb, id: string): Promise<SmartArticle> {
  const rows = await db.execute(sql`select id,title,path,excerpt,body,revision,published_at as "publishedAt",updated_at as "updatedAt" from smart_public_articles where id=${id}::uuid`);
  if (!rows[0]) throw new SmartError("not_found", 404, "Тази новина не е достъпна.");
  const row = rows[0];
  return { ...row, publishedAt: new Date(row.publishedAt as string).toISOString(), updatedAt: new Date(row.updatedAt as string).toISOString() } as SmartArticle;
}
export async function smartSourcesPublic(db: SmartDb, sources: SmartSource[],current?:Pick<SmartArticle,"id"|"revision">): Promise<boolean> {
  const own = sources.filter(s => s.articleId);
  if(!own.length&&!current)return true;
  const refs=own.map(source=>({articleId:source.articleId,revision:source.version,publishedAt:source.publishedAt?new Date(source.publishedAt).toISOString():null,current:source.kind==="current"}));
  // One database round trip for the whole pack, retaining revision, publication
  // time, public visibility and the six-month boundary for every source.
  const anchor=current?sql`exists(select 1 from smart_public_articles where id=${current.id}::uuid and revision=${current.revision})`:sql`true`;
  const rows=await db.execute(sql`select count(*)::int as valid,${anchor} as current_valid from jsonb_to_recordset(${JSON.stringify(refs)}::jsonb)
    as ref("articleId" uuid,revision text,"publishedAt" timestamptz,current boolean)
    join smart_public_articles a on a.id=ref."articleId" and a.revision=ref.revision
    where (ref."publishedAt" is null or date_trunc('milliseconds',a.published_at)=ref."publishedAt")
      and (ref.current or a.published_at>=now()-interval '6 months')`);
  return Number(rows[0]?.valid)===own.length&&rows[0]?.current_valid===true;
}
export function readSmartBootstrap(db:SmartDb,articleId:string,retry?:boolean):Promise<SmartBootstrap>;
export function readSmartBootstrap(db:SmartDb,articleId:string,retry:boolean,cachedOnly:true):Promise<SmartBootstrap|null>;
export async function readSmartBootstrap(db: SmartDb, articleId: string, retry = false,cachedOnly=false): Promise<SmartBootstrap|null> {
  const article = await smartArticle(db, articleId);
  const rows = await db.execute(sql`select payload,sources,state,expires_at,revision from smart_bootstraps where article_id=${articleId}::uuid`);
  const current=rows[0];
  if(current?.revision===article.revision&&current.state==='ready'&&(current.payload as SmartBootstrap|null)?.questions?.length===3&&new Date(current.expires_at as string).getTime()>Date.now()&&await smartSourcesPublic(db,current.sources as SmartSource[]))return publicSmartBootstrap(current.payload as SmartBootstrap);
  if(cachedOnly)return null;
  if(current?.revision===article.revision&&current.state==='uncertain'&&!retry)return{status:"unavailable",articleId,version:article.revision,questions:[],related:null,message:"Въпросите не се заредиха. Можеш да опиташ отново."};
  await db.execute(sql`insert into smart_bootstraps(article_id,revision,state) values(${articleId}::uuid,${article.revision},'pending')
    on conflict(article_id) do update set state='pending',revision=excluded.revision,payload=null,lease_token=null,lease_until=null,updated_at=now()
    where smart_bootstraps.state<>'pending' or smart_bootstraps.revision<>excluded.revision`);
  return { status: "preparing", articleId, version: article.revision, questions: [], related: null };
}
export async function openSmartSession(db: SmartDb, articleId: string, owner: string) {
  const article = await smartArticle(db, articleId);
  const rows = await db.execute(sql`insert into smart_sessions(id,article_id,owner_hash,revision,expires_at)
    values(${randomUUID()}::uuid,${articleId}::uuid,${owner},${article.revision},now()+interval '24 hours')
    on conflict(article_id,owner_hash) do update set
      used=case when smart_sessions.expires_at<=now() then 0 else smart_sessions.used end,
      deleted_at=case when smart_sessions.expires_at<=now() then null else smart_sessions.deleted_at end,
      created_at=case when smart_sessions.expires_at<=now() then now() else smart_sessions.created_at end,
      expires_at=case when smart_sessions.expires_at<=now() then now()+interval '24 hours' else smart_sessions.expires_at end
    returning id,used,deleted_at`);
  const row = rows[0]!;
  if (row.deleted_at) throw new SmartError("deleted", 410, "Разговорът е изтрит. Квотата остава до изтичане на сесията.");
  return String(row.id);
}
export async function readSmartSession(db: SmartDb, id: string, owner: string) {
  // One snapshot for ownership, publication, revision and turns. Polling does not
  // need the full article body or three serial SSH/database round trips.
  const rows=await db.execute(sql`select s.*,a.id as "articleId",a.revision as "currentRevision",now() as "serverNow",
    (s.used>=${SMART_QUESTION_LIMIT} and s.updated_at+make_interval(secs=>${SMART_QUESTION_COOLDOWN_SECONDS})<=now()) as quota_expired,
    s.updated_at+make_interval(secs=>${SMART_QUESTION_COOLDOWN_SECONDS}) as "quotaResetAt",
    coalesce((select jsonb_agg(t.item order by t.created_at) from (
      select created_at,jsonb_build_object('id',id,'question',question,'status',status,'answer',answer,'cached',cached,'nodeKey',node_key) as item
      from smart_turns where session_id=s.id and created_at>=s.created_at
      and (status<>'failed' or created_at=(select max(created_at) from smart_turns where session_id=s.id)) order by created_at desc limit 10
    ) t),'[]'::jsonb) as turns
    from smart_sessions s join smart_public_articles a on a.id=s.article_id
    where s.id=${id}::uuid and s.owner_hash=${owner} and s.expires_at>now() and s.deleted_at is null`);
  const session=rows[0];
  if(!session)throw new SmartError("session",404,"Сесията не е достъпна или е изтекла.");
  const turns=session.turns as {id:string;question:string;status:SmartTurn["status"];answer:SmartAnswer|null;cached:boolean;nodeKey:string|null}[];
  const all=turns.flatMap(turn=>turn.answer?.sources??[]);
  // Normal history is checked in one batch. A withdrawn/revised dependency falls
  // back to per-turn checks so unrelated valid answers remain available.
  if(!await smartSourcesPublic(db,all))for(const turn of turns)if(turn.answer&&!await smartSourcesPublic(db,turn.answer.sources))turn.answer=null;
  return {id,articleId:String(session.articleId),revision:String(session.currentRevision),usedQuestions:session.quota_expired?0:Math.min(Number(session.used),SMART_QUESTION_LIMIT),maxQuestions:SMART_QUESTION_LIMIT,quotaResetAt:Number(session.used)>=SMART_QUESTION_LIMIT&&!session.quota_expired?new Date(session.quotaResetAt as string).toISOString():null,serverNow:new Date(session.serverNow as string).toISOString(),updated:session.currentRevision!==session.revision,turns};
}

export type SmartAsk = { sessionId: string; requestKey: string; question: string; questionId?: string | undefined; parentKey?: string | undefined };
export async function reserveSmartTurn(db: SmartDb, owner: string, input: SmartAsk) {
  return db.transaction(async tx=>{
    // Lock the session first. A second statement gets a fresh snapshot after any
    // concurrent owner finishes, preserving idempotency and the three-question quota.
    const sessions=await tx.execute(sql`select *,used>=${SMART_QUESTION_LIMIT} and updated_at+make_interval(secs=>${SMART_QUESTION_COOLDOWN_SECONDS})<=now() as quota_expired from smart_sessions where id=${input.sessionId}::uuid and owner_hash=${owner} and expires_at>now() and deleted_at is null for update`);
    const session=sessions[0];if(!session)throw new SmartError("session",404,"Сесията не е достъпна.");
    const used=session.quota_expired?0:Number(session.used);
    const hash=smartHash([input.question,input.questionId??null,input.parentKey??null]);
    const rows=await tx.execute(sql`with previous as (
      select * from smart_turns where session_id=${input.sessionId}::uuid and request_key=${input.requestKey}::uuid
    ), expired as (
      update smart_turns set status='failed' where session_id=${input.sessionId}::uuid and status='pending' and lease_until<=now() and not exists(select 1 from previous) returning id
    ), inserted as (
      insert into smart_turns(id,session_id,request_key,input_hash,question,question_id,parent_key,status,lease_until)
      select ${randomUUID()}::uuid,${input.sessionId}::uuid,${input.requestKey}::uuid,${hash},${input.question},${input.questionId??null},${input.parentKey??null},'pending',now()+interval '10 minutes'
      where not exists(select 1 from previous) and ${used}<${SMART_QUESTION_LIMIT}
        -- Consume RETURNING before INSERT checks the one-active-turn index.
        and (select count(*) from expired)>=0
        and exists(select 1 from smart_public_articles where id=${String(session.article_id)}::uuid)
        and not exists(select 1 from smart_turns where session_id=${input.sessionId}::uuid and status='pending' and lease_until>now())
      returning *
    ), extended as (
      update smart_sessions set used=${used},expires_at=now()+interval '24 hours',updated_at=now() where id=${input.sessionId}::uuid and exists(select 1 from inserted) returning id
    ) select exists(select 1 from smart_public_articles where id=${String(session.article_id)}::uuid) as "articleReady",
      coalesce((select to_jsonb(p) from previous p),(select to_jsonb(i) from inserted i)) as turn,
      exists(select 1 from smart_turns where session_id=${input.sessionId}::uuid and status='pending' and lease_until>now()) as busy`);
    const row=rows[0]!;if(!row.articleReady)throw new SmartError("not_found",404,"Тази новина не е достъпна.");
    const turn=row.turn as Record<string,unknown>|null;
    if(turn){if(turn.input_hash!==hash)throw new SmartError("idempotency",409,"Повторен идентификатор с различен въпрос.");return Object.assign(turn,{session_used:used});}
    if(row.busy)throw new SmartError("busy",409,"Предишният въпрос още се обработва.");
    throw new SmartError("question_limit",429,"Използва трите въпроса по тази новина. Можеш да продължиш след 10 минути.");
  });
}
export async function finishSmartTurn(db: SmartDb, id: string, answer: SmartAnswer, cached: boolean, nodeKey: string | null) {
  return db.transaction(async tx=>{
    // Same session-first lock order as reservation/deletion. Only metadata is
    // read; no full article body travels through SSH while finishing a turn.
    const rows=await tx.execute(sql`select s.id as "sessionId",s.deleted_at,s.used,t.status,t.lease_until,
      a.id as "articleId",a.title,a.path from smart_turns t join smart_sessions s on s.id=t.session_id
      left join smart_public_articles a on a.id=s.article_id where t.id=${id}::uuid for update of s`);
    const row=rows[0];if(!row)throw new SmartError("turn",404,"Въпросът не е достъпен.");
    if(row.status!=="pending")return;
    if(row.deleted_at||Number(row.used)>=SMART_QUESTION_LIMIT||new Date(row.lease_until as string).getTime()<=Date.now())throw new SmartError("expired",409,"Обработката е изтекла. Възстановете разговора.");
    if(!row.articleId)throw new SmartError("not_found",404,"Тази новина не е достъпна.");
    const counted=answer.status!=="off_topic";
    await tx.execute(sql`with changed as (
      update smart_turns set status='completed',answer=${JSON.stringify(answer)}::jsonb,cached=${cached},node_key=${nodeKey},counted=${counted}
      where id=${id}::uuid and status='pending' and lease_until>now() returning id
    ), counted_session as (
      update smart_sessions set used=used+1,updated_at=now() where id=${String(row.sessionId)}::uuid and ${counted} and exists(select 1 from changed) returning id
    ) insert into smart_activity(turn_id,article_id,article_snapshot,cached,environment)
      select id,${String(row.articleId)}::uuid,${JSON.stringify({id:row.articleId,title:row.title,path:row.path})}::jsonb,${cached},${process.env.NODE_ENV==="production"?"production":process.env.NODE_ENV==="test"?"test":"development"}
      from changed on conflict do nothing`);
  });
}
export async function failSmartTurn(db: SmartDb, id: string) { await db.execute(sql`update smart_turns set status='failed' where id=${id}::uuid and status='pending'`); }
export async function deleteSmartSession(db: SmartDb, id: string, owner: string) {
  await db.transaction(async tx => {
    const rows = await tx.execute(sql`update smart_sessions set deleted_at=now() where id=${id}::uuid and owner_hash=${owner} returning id`);
    if (!rows.length) throw new SmartError("session", 404, "Сесията не е достъпна.");
    await tx.execute(sql`delete from smart_turns where session_id=${id}::uuid`);
  });
}
export function smartNodeKey(article: SmartArticle, questionId: string, parent: string | null, generation: string) {
  return smartHash([article.id, article.revision,article.publishedAt, questionId, parent, generation, SMART_PROMPT_VERSION, "bg"]);
}
export async function acquireSmartNode(db: SmartDb, key: string, article: SmartArticle, questionId: string, question: string, parent: string | null) {
  const token = randomUUID();
  const rows = await db.execute(sql`insert into smart_nodes(key,article_id,revision,parent_key,question_id,question,state,lease_token,lease_until)
    values(${key},${article.id}::uuid,${article.revision},${parent},${questionId},${question},'pending',${token}::uuid,now()+interval '10 minutes')
    on conflict(key) do nothing returning key`);
  if (rows.length) return { acquired: true, token, answer: null };
  const nodes = await db.execute(sql`select * from smart_nodes where key=${key}`);
  const node = nodes[0]!;
  if (node.state === "ready" && new Date(node.expires_at as string).getTime() > Date.now()) {
    const answer = node.answer as SmartAnswer;
    if (await smartSourcesPublic(db, answer.sources)) return { acquired: false, token: null, answer };
  }
  // Expired in-flight requests are uncertain, not automatically duplicated.
  if (node.state === "pending" || node.state === "uncertain") throw new SmartError("preparing", 409, "Отговорът се подготвя или очаква проверка. Опитайте отново след малко.");
  const updated = await db.execute(sql`update smart_nodes set state='pending',lease_token=${token}::uuid,lease_until=now()+interval '10 minutes',answer=null
    where key=${key} and state in ('ready','failed') returning key`);
  if (!updated.length) throw new SmartError("preparing", 409, "Отговорът се подготвя.");
  return { acquired: true, token, answer: null };
}
export async function finishSmartNode(db: SmartDb, key: string, token: string, answer: SmartAnswer) {
  const refs=answer.sources.filter(s=>s.articleId).map(source=>({articleId:source.articleId,revision:source.version}));
  // Atomic publication and dependency replacement in one database round trip.
  // A stale lease cannot delete or insert dependencies. Consume DELETE RETURNING
  // before INSERT so an existing dependency cannot hide a changed revision.
  const rows=await db.execute(sql`with published as (
    update smart_nodes set state='ready',answer=${JSON.stringify(answer)}::jsonb,expires_at=${new Date(answer.expiresAt).toISOString()}::timestamptz,lease_until=null
    where key=${key} and lease_token=${token}::uuid and state='pending' and lease_until>now() returning key
  ), removed as (
    delete from smart_dependencies d using published p where d.node_key=p.key returning d.node_key
  ), inserted as (
    insert into smart_dependencies(node_key,article_id,revision)
    select p.key,r."articleId",r.revision from published p cross join jsonb_to_recordset(${JSON.stringify(refs)}::jsonb) r("articleId" uuid,revision text)
    where (select count(*) from removed)>=0 on conflict do nothing returning node_key
  ) select key from published`);
  if(!rows.length)throw new SmartError("lease",409,"Отговорът очаква проверка.");
}
export async function smartRateLimit(db: SmartDb, key: string, maximum: number, seconds: number) {
  const bucket = new Date(Math.floor(Date.now() / (seconds * 1000)) * seconds * 1000);
  const rows = await db.execute(sql`insert into smart_rate_windows(key,bucket) values(${key},${bucket.toISOString()}::timestamptz) on conflict(key,bucket) do update set count=smart_rate_windows.count+1 returning count`);
  if (Number(rows[0]?.count) > maximum) throw new SmartError("rate_limit", 429, "Твърде много заявки. Опитайте след малко.");
}
export async function pruneSmartPrivateData(db:SmartDb){
  // Operational retention default; the financial ledger is deliberately independent.
  await db.execute(sql`delete from smart_sessions where expires_at<now()-interval '7 days'`);
  await db.execute(sql`delete from smart_rate_windows where bucket<now()-interval '2 days'`);
}
