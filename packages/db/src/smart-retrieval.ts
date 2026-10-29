import {sql} from "drizzle-orm";
import {smartArticleText} from "@newspoint/content/smart-text";
import type {SmartDb,SmartArticle} from "./smart";

/** Full-content candidate generation; AI judges relevance afterward.
 * OpenAI vectors remain untouched and never mix with another vector space. */
export async function searchSmartCandidates(db:SmartDb,excludeArticle:string,queries:readonly string[]) {
  const safe=queries.slice(0,4).map(q=>q.trim().slice(0,180)).filter(Boolean);
  if(!safe.length)return [];
  const rows=await db.execute(sql`with queries as (
    select plainto_tsquery('simple',value) as query from jsonb_array_elements_text(${JSON.stringify(safe)}::jsonb)
  ), candidates as (
    select a.id,a.title,a.path,a.excerpt,a.body,a.revision,a.published_at,a.updated_at,
      to_tsvector('simple',coalesce(a.title,'')||' '||coalesce(a.excerpt,'')||' '||a.body::text) as document
    from smart_public_articles a where a.id<>${excludeArticle}::uuid and a.published_at>=now()-interval '6 months'
  ) select a.id,a.title,a.path,a.excerpt,a.body,a.revision,a.published_at,a.updated_at,max(ts_rank_cd(a.document,q.query)) as score
    from candidates a cross join queries q where a.document@@q.query
    group by a.id,a.title,a.path,a.excerpt,a.body,a.revision,a.published_at,a.updated_at order by score desc,a.published_at desc,a.id limit 12`);
  return rows.map(row=>({article_id:String(row.id),publishedAt:new Date(row.published_at as string).toISOString(),text:`${row.title}\n${row.excerpt}\n${smartArticleText(row.body)}`.slice(0,20000),
    article:{id:String(row.id),title:String(row.title),path:String(row.path),excerpt:String(row.excerpt),body:row.body,revision:String(row.revision),publishedAt:new Date(row.published_at as string).toISOString(),updatedAt:new Date(row.updated_at as string).toISOString()} satisfies SmartArticle}));
}
