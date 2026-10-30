import {sql} from "drizzle-orm";
import {smartArticleText} from "@newspoint/content/smart-text";
import type {SmartDb,SmartArticle} from "./smart";

/** Full-content candidate generation; AI judges relevance afterward.
 * OpenAI vectors remain untouched and never mix with another vector space. */
export async function searchSmartCandidates(db:SmartDb,excludeArticle:string,queries:readonly string[]) {
  const safe=queries.slice(0,4).map(q=>q.trim().slice(0,180)).filter(Boolean);
  if(!safe.length)return [];
  const rows=await db.execute(sql`with queries as materialized (
    select plainto_tsquery('simple',value) as query from jsonb_array_elements_text(${JSON.stringify(safe)}::jsonb)
  ), candidates as (
    -- Keep this expression identical to migration 49. PostgreSQL can use the
    -- native GIN index for each query instead of tokenizing the entire archive.
    select a.id,a.published_at,
      ts_rank_cd(to_tsvector('simple',coalesce(a.title,'')||' '||coalesce(a.excerpt,'')||' '||a.body::text),q.query) as score
    from smart_public_articles a cross join queries q
    where a.id<>${excludeArticle}::uuid and a.published_at>=now()-interval '6 months'
      and to_tsvector('simple',coalesce(a.title,'')||' '||coalesce(a.excerpt,'')||' '||a.body::text)@@q.query
  ), ranked as (
    select id,published_at,max(score) as score from candidates
    group by id,published_at order by score desc,published_at desc,id limit 12
  ) select a.id,a.title,a.path,a.excerpt,a.body,a.revision,a.published_at,a.updated_at,r.score
    from ranked r join smart_public_articles a on a.id=r.id
    order by r.score desc,r.published_at desc,r.id`);
  return rows.map(row=>({article_id:String(row.id),publishedAt:new Date(row.published_at as string).toISOString(),text:`${row.title}\n${row.excerpt}\n${smartArticleText(row.body)}`.slice(0,20000),
    article:{id:String(row.id),title:String(row.title),path:String(row.path),excerpt:String(row.excerpt),body:row.body,revision:String(row.revision),publishedAt:new Date(row.published_at as string).toISOString(),updatedAt:new Date(row.updated_at as string).toISOString()} satisfies SmartArticle}));
}
