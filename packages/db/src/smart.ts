import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { SMART_PROMPT_VERSION, type SmartAnswer, type SmartBootstrap, type SmartSource,type SmartTurn } from "@newspoint/content/smart";
import type { ScriptDb } from "./node";

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
export async function smartSourcesPublic(db: SmartDb, sources: SmartSource[]): Promise<boolean> {
  const own = sources.filter(s => s.articleId);
  for (const source of own) {
    const rows = await db.execute(sql`select revision,published_at,published_at>=now()-interval '6 months' as eligible from smart_public_articles where id=${source.articleId}::uuid`);
    if (!rows[0] || rows[0].revision !== source.version || (source.publishedAt&&new Date(rows[0].published_at as string).toISOString()!==new Date(source.publishedAt).toISOString()) || (source.kind!=="current"&&!rows[0].eligible)) return false;
  }
  return true;
}
export async function readSmartBootstrap(db: SmartDb, articleId: string): Promise<SmartBootstrap> {
  const article = await smartArticle(db, articleId);
  const rows = await db.execute(sql`select payload,sources,state,expires_at,revision from smart_bootstraps where article_id=${articleId}::uuid`);
  const current=rows[0];
  if(current?.revision===article.revision&&current.state==='uncertain')return{status:"unavailable",articleId,version:article.revision,questions:[],related:null,message:"Подготовката очаква проверка от екипа."};
  if(current?.revision===article.revision&&current.state==='ready'&&new Date(current.expires_at as string).getTime()>Date.now()&&await smartSourcesPublic(db,current.sources as SmartSource[]))return current.payload as SmartBootstrap;
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
  const rows = await db.execute(sql`select * from smart_sessions where id=${id}::uuid and owner_hash=${owner} and expires_at>now() and deleted_at is null`);
  const session = rows[0];
  if (!session) throw new SmartError("session", 404, "Сесията не е достъпна или е изтекла.");
  const article = await smartArticle(db, String(session.article_id));
  const turns = await db.execute(sql`select id,question,status,answer,cached,node_key as "nodeKey" from smart_turns where session_id=${id}::uuid and created_at>=${new Date(session.created_at as string).toISOString()}::timestamptz
    and (status<>'failed' or created_at=(select max(created_at) from smart_turns where session_id=${id}::uuid)) order by created_at limit 10`);
  // Never restore withdrawn sources in previously saved answers.
  for (const turn of turns) if (turn.answer && !await smartSourcesPublic(db, (turn.answer as SmartAnswer).sources)) turn.answer = null;
  const typedTurns=turns.map(turn=>({id:String(turn.id),question:String(turn.question),status:turn.status as SmartTurn["status"],answer:turn.answer as SmartAnswer|null,cached:Boolean(turn.cached),nodeKey:turn.nodeKey?String(turn.nodeKey):null}));
  return { id, articleId: article.id, revision: article.revision, usedQuestions: Number(session.used), maxQuestions: 5, updated: article.revision !== session.revision, turns:typedTurns };
}
export type SmartAsk = { sessionId: string; requestKey: string; question: string; questionId?: string | undefined; parentKey?: string | undefined };
export async function reserveSmartTurn(db: SmartDb, owner: string, input: SmartAsk) {
  return db.transaction(async tx => {
    const rows = await tx.execute(sql`select * from smart_sessions where id=${input.sessionId}::uuid and owner_hash=${owner} and expires_at>now() and deleted_at is null for update`);
    const session = rows[0];
    if (!session) throw new SmartError("session", 404, "Сесията не е достъпна.");
    await smartArticle(tx, String(session.article_id));
    const hash = smartHash([input.question, input.questionId ?? null, input.parentKey ?? null]);
    const previous = await tx.execute(sql`select * from smart_turns where session_id=${input.sessionId}::uuid and request_key=${input.requestKey}::uuid`);
    if (previous[0]) {
      if (previous[0].input_hash !== hash) throw new SmartError("idempotency", 409, "Повторен идентификатор с различен въпрос.");
      return previous[0];
    }
    await tx.execute(sql`update smart_turns set status='failed' where session_id=${input.sessionId}::uuid and status='pending' and lease_until<=now()`);
    const busy = await tx.execute(sql`select id from smart_turns where session_id=${input.sessionId}::uuid and status='pending'`);
    if (busy.length) throw new SmartError("busy", 409, "Предишният въпрос още се обработва.");
    if (Number(session.used) >= 5) throw new SmartError("question_limit", 429, "Използва петте въпроса по тази новина.");
    const turn = await tx.execute(sql`insert into smart_turns(id,session_id,request_key,input_hash,question,question_id,parent_key,status,lease_until)
      values(${randomUUID()}::uuid,${input.sessionId}::uuid,${input.requestKey}::uuid,${hash},${input.question},${input.questionId ?? null},${input.parentKey ?? null},'pending',now()+interval '10 minutes') returning *`);
    await tx.execute(sql`update smart_sessions set expires_at=now()+interval '24 hours',updated_at=now() where id=${input.sessionId}::uuid`);
    return turn[0]!;
  });
}
export async function finishSmartTurn(db: SmartDb, id: string, answer: SmartAnswer, cached: boolean, nodeKey: string | null) {
  return db.transaction(async tx => {
    // Lock session first, same order as reservation/deletion.
    const ref = await tx.execute(sql`select session_id from smart_turns where id=${id}::uuid`);
    if (!ref[0]) throw new SmartError("turn", 404, "Въпросът не е достъпен.");
    const session = await tx.execute(sql`select * from smart_sessions where id=${ref[0].session_id as string}::uuid for update`);
    const turn = await tx.execute(sql`select * from smart_turns where id=${id}::uuid for update`);
    if (turn[0]?.status !== "pending") return;
    if (session[0]?.deleted_at || Number(session[0]?.used) >= 5 || new Date(turn[0].lease_until as string).getTime() <= Date.now()) throw new SmartError("expired", 409, "Обработката е изтекла. Възстановете разговора.");
    const counted = answer.status !== "off_topic";
    await tx.execute(sql`update smart_turns set status='completed',answer=${JSON.stringify(answer)}::jsonb,cached=${cached},node_key=${nodeKey},counted=${counted} where id=${id}::uuid`);
    if (counted) await tx.execute(sql`update smart_sessions set used=used+1,updated_at=now() where id=${ref[0].session_id as string}::uuid`);
    const article = await smartArticle(tx,String(session[0]!.article_id));
    await tx.execute(sql`insert into smart_activity(turn_id,article_id,article_snapshot,cached,environment) values(${id}::uuid,${article.id}::uuid,${JSON.stringify({id:article.id,title:article.title,path:article.path})}::jsonb,${cached},${process.env.NODE_ENV === "production"?"production":process.env.NODE_ENV === "test"?"test":"development"}) on conflict do nothing`);
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
  await db.transaction(async tx => {
    const rows = await tx.execute(sql`update smart_nodes set state='ready',answer=${JSON.stringify(answer)}::jsonb,expires_at=${new Date(answer.expiresAt).toISOString()}::timestamptz,lease_until=null
      where key=${key} and lease_token=${token}::uuid and state='pending' and lease_until>now() returning key`);
    if (!rows.length) throw new SmartError("lease", 409, "Отговорът очаква проверка.");
    await tx.execute(sql`delete from smart_dependencies where node_key=${key}`);
    for (const source of answer.sources.filter(s => s.articleId)) await tx.execute(sql`insert into smart_dependencies(node_key,article_id,revision) values(${key},${source.articleId}::uuid,${source.version!}) on conflict do nothing`);
  });
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
