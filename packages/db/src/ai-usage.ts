import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { AI_RATES, aiCostUsd, type AiUsage } from "@newspoint/content/smart";
import type { SmartDb } from "./smart";

export type AiOperation = { module: string; provider: string; articleId?: string | null; title?: string; path?: string; model: string; operation: string; environment?: string; projectId?: string | null };
export async function startAiOperation(db: SmartDb, operation: AiOperation) {
  const id = randomUUID();
  await db.execute(sql`insert into ai_operations(id,module,provider,project_id,article_id,article_snapshot,operation,model,environment,status)
    values(${id}::uuid,${operation.module},${operation.provider},${operation.projectId ?? null},${operation.articleId ?? null}::uuid,
    ${JSON.stringify({ id:operation.articleId??null,title: operation.title ?? "", path: operation.path ?? "" })}::jsonb,${operation.operation},${operation.model},${operation.environment ?? (process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development")},'pending')`);
  return id;
}
export async function settleAiOperation(db: SmartDb, id: string, model: string, usage: AiUsage | null, responseId: string | null, requestId: string | null, errorCode: string | null = null) {
  const rate = AI_RATES[model];
  const amount = usage && rate ? aiCostUsd(usage, rate) : null;
  await db.execute(sql`update ai_operations set status=${amount === null ? "unknown" : "known"}, usage=${usage ? JSON.stringify(usage) : null}::jsonb,
    model=${model},rate=${rate ? JSON.stringify(rate) : null}::jsonb,amount_usd=${amount}::numeric,response_id=${responseId},request_id=${requestId},error_code=${errorCode},finished_at=now()
    where id=${id}::uuid and status in ('pending','unknown')`);
}
export async function markAiUnknown(db: SmartDb, id: string, code: string) {
  await db.execute(sql`update ai_operations set status='unknown',error_code=${code},finished_at=now() where id=${id}::uuid and status='pending'`);
}
export function parseOpenAiUsage(data: Record<string, unknown>): AiUsage | null {
  const usage = data.usage as Record<string, unknown> | undefined;
  if (!usage) return null;
  const details = usage.input_tokens_details as Record<string, unknown> | undefined;
  const output = usage.output_tokens_details as Record<string, unknown> | undefined;
  const input = usage.input_tokens ?? usage.prompt_tokens;
  const out = usage.output_tokens ?? (data.object === "list" ? 0 : undefined);
  if (!Number.isSafeInteger(input) || !Number.isSafeInteger(out)) return null;
  const items = Array.isArray(data.output) ? data.output as Record<string, unknown>[] : [];
  if(items.some(x=>x.type==='web_search_call'&&x.status!=='completed'))return null;
  const parsed = {
    input: Number(input), cachedInput: Number(details?.cached_tokens ?? 0), cacheWrite: Number(details?.cache_write_tokens ?? 0),
    output: Number(out), reasoning: Number(output?.reasoning_tokens ?? 0),
    searches: items.filter(x => x.type === "web_search_call" && x.status === "completed").length,
  };
  return Object.values(parsed).every(x => Number.isSafeInteger(x) && x >= 0) ? parsed : null;
}
export type CostFilters = { start: Date; end: Date; module: string | null; article: string | null; environment: string | null; page: number; query?:string|null };
export function costFilters(params: URLSearchParams): CostFilters {
  const now = new Date();
  const start = params.get("start") ? new Date(params.get("start")!) : new Date(now.getTime() - 30 * 86400_000);
  const end = params.get("end") ? new Date(params.get("end")!) : now;
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || start >= end) throw new Error("invalid_period");
  const article = params.get("article");
  if (article && !/^[0-9a-f-]{36}$/i.test(article)) throw new Error("invalid_article");
  const page = Number(params.get("page") ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error("invalid_page");
  const module = params.get("module");
  if (module && !/^[a-z_]{1,60}$/.test(module)) throw new Error("invalid_module");
  const environment = params.get("environment");
  if (environment && !["production", "development", "test"].includes(environment)) throw new Error("invalid_environment");
  const query=params.get("q")?.trim()||null;
  if(query&&query.length>160)throw new Error("invalid_query");
  return { start, end, module, article, environment, page, query };
}
export async function readAiCosts(db: SmartDb, f: CostFilters) {
  const ready = await db.execute(sql`select to_regclass('public.ai_operations') is not null as ready`);
  if (!ready[0]?.ready) return { ready: false, modules: [], articles: [], operations: [], daily: [], totals: null, grandTotals:null, provider: [], coverage: [] };
  const articleKey=sql`coalesce(article_id,(article_snapshot->>'id')::uuid)`;
  const search=f.query?`%${f.query.replace(/[\\%_]/g,x=>`\\${x}`)}%`:null;
  // Match article identity first, then include all of its operations, including older titles.
  const titleFilter=sql`(${search}::text is null or ${articleKey} in (
    select id from articles where title ilike ${search}
    union select coalesce(m.article_id,(m.article_snapshot->>'id')::uuid) from ai_operations m where m.article_snapshot->>'title' ilike ${search}
  ))`;
  const filter = sql`${titleFilter} and started_at>=${f.start.toISOString()}::timestamptz and started_at<${f.end.toISOString()}::timestamptz and (${f.module}::text is null or module=${f.module}) and (${f.article}::uuid is null or ${articleKey}=${f.article}::uuid) and (${f.environment}::text is null or environment=${f.environment})`;
  const knownTotal=sql`case when count(*)>0 and count(amount_usd)=0 then null else coalesce(sum(amount_usd),0) end`;
  const [totals, modules, articles, operations, daily, provider, grandTotals] = await Promise.all([
    db.execute(sql`select ${knownTotal}::text as amount,count(*)::int as calls,count(*) filter(where amount_usd is null)::int as pending from ai_operations where ${filter}`),
    db.execute(sql`select module,provider,${knownTotal}::text as amount,count(*)::int as calls,count(*) filter(where amount_usd is null)::int as pending from ai_operations where ${filter} group by module,provider order by sum(amount_usd) desc nulls last`),
    db.execute(sql`with spend as (select ${articleKey} as id,max(article_snapshot->>'title') as title,max(article_snapshot->>'path') as path,${knownTotal} as amount,count(*)::int as calls,
      coalesce(sum((usage->>'searches')::int),0)::int as searches,count(*) filter(where amount_usd is null)::int as pending
      from ai_operations where ${filter} group by ${articleKey}), activity as (
      select ${articleKey} as id,max(article_snapshot->>'title') as title,max(article_snapshot->>'path') as path,count(*) filter(where cached)::int as hits,count(*) filter(where not cached)::int as generated
      from smart_activity where ${titleFilter} and created_at>=${f.start.toISOString()}::timestamptz and created_at<${f.end.toISOString()}::timestamptz and (${f.module}::text is null or ${f.module}='smart')
      and (${f.article}::uuid is null or ${articleKey}=${f.article}::uuid) and (${f.environment}::text is null or environment=${f.environment}) group by ${articleKey})
      select coalesce(s.id,a.id) as id,coalesce(s.title,a.title) as title,coalesce(s.path,a.path) as path,(case when s.calls>0 and s.amount is null then null else coalesce(s.amount,0) end)::text as amount,
      coalesce(s.calls,0) as calls,coalesce(s.searches,0) as searches,coalesce(s.pending,0) as pending,coalesce(a.hits,0) as "cacheHits",coalesce(a.generated,0) as generated,
      (select (case when count(*)>0 and count(o.amount_usd)=0 then null else coalesce(sum(o.amount_usd),0) end)::text from ai_operations o where coalesce(o.article_id,(o.article_snapshot->>'id')::uuid)=coalesce(s.id,a.id) and (${f.module}::text is null or o.module=${f.module}) and (${f.environment}::text is null or o.environment=${f.environment})) as "lifetimeAmount",
      not exists(select 1 from articles where id=coalesce(s.id,a.id)) as deleted
      from spend s full outer join activity a on s.id=a.id order by coalesce(s.amount,0) desc,coalesce(s.id,a.id) limit 50 offset ${(f.page - 1) * 50}`),
    f.article ? db.execute(sql`select id,operation,model,status,amount_usd::text as amount,usage,rate,error_code,started_at as "startedAt",finished_at as "finishedAt" from ai_operations where ${filter} order by started_at desc,id limit 100 offset ${(f.page - 1) * 100}`) : Promise.resolve([]),
    db.execute(sql`select to_char(started_at at time zone 'Europe/Sofia','YYYY-MM-DD') as day,${knownTotal}::text as amount from ai_operations where ${filter} group by day order by day`),
    db.execute(sql`with report as (select provider,project_id,currency,sum(amount) as amount,min(bucket_start) as period_start,max(bucket_end) as period_end,max(checked_at) as checked_at from ai_provider_costs where bucket_start>=${f.start.toISOString()}::timestamptz and bucket_end<=${f.end.toISOString()}::timestamptz group by provider,project_id,currency)
      select r.provider,r.project_id as "projectId",r.currency,r.amount::text as amount,r.checked_at as "checkedAt",r.period_start as "periodStart",r.period_end as "periodEnd",
        local.amount::text as "localAmount",case when r.currency='usd' then (r.amount-local.amount)::text else null end as difference,local.pending,
        ${f.environment}::text is not null as "environmentFiltered"
      from report r cross join lateral (select (case when count(*)>0 and count(o.amount_usd)=0 then null else coalesce(sum(o.amount_usd),0) end) as amount,count(*) filter(where o.amount_usd is null)::int as pending from ai_operations o
        where o.provider=r.provider and o.project_id=r.project_id and o.started_at>=r.period_start and o.started_at<r.period_end and (${f.environment}::text is null or o.environment=${f.environment})) local`),
    db.execute(sql`select ${knownTotal}::text as amount,count(*)::int as calls,count(*) filter(where amount_usd is null)::int as pending from ai_operations where started_at>=${f.start.toISOString()}::timestamptz and started_at<${f.end.toISOString()}::timestamptz and (${f.environment}::text is null or environment=${f.environment})`),
  ]);
  // Explicit coverage; existing Gemini/TTS costs must never silently appear as zero.
  return { ready: true, modules, articles, operations, daily, totals: totals[0], grandTotals:grandTotals[0], provider, coverage: [
    { module: "smart", name: "NewsPoint Smart", status: "metered" },
    { module: "podcast", name: "AI подкасти", status: "not_connected" },
    { module: "tts", name: "Четене на статии", status: "not_connected" },
  ], period: { start: f.start.toISOString(), end: f.end.toISOString() }, page: f.page };
}
