import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {sql,type SQL} from "drizzle-orm";
import {afterAll,beforeAll,expect,it} from "vitest";
import {searchSmartCandidates} from "./smart-retrieval";
import type {SmartDb} from "./smart";

let pg:PGlite,db:SmartDb,lastQuery:SQL;
const excluded=randomUUID();
beforeAll(async()=>{
  pg=new PGlite();const raw=drizzle(pg);
  db={execute:async(query:SQL)=>{lastQuery=query;return (await raw.execute(query)).rows;}} as SmartDb;
  await pg.exec(`create table articles(id uuid primary key,title text,excerpt text,body jsonb,path text,revision text,published_at timestamptz,updated_at timestamptz,is_public boolean);
    create view smart_public_articles as select id,title,excerpt,body,path,revision,published_at,updated_at from articles where is_public and published_at<=now();`);
  for(let index=0;index<25;index++){
    await db.execute(sql`insert into articles values(${index===0?excluded:randomUUID()}::uuid,'Explicit QA headline','',${JSON.stringify([{type:"paragraph",text:`Само в съдържанието: QAAlpha ${index%2?"QABeta":"QAGamma"} ${"QAAlpha ".repeat(index%4)}`}])}::jsonb,${`/qa-${index}/`},'qa-revision',now()-${`${index%3+1} days`}::interval,now(),true)`);
  }
  for(const [age,visible] of [["7 months",true],["-1 day",true],["1 day",false]] as const){
    await db.execute(sql`insert into articles values(${randomUUID()}::uuid,'Excluded QAAlpha QABeta','',${JSON.stringify([{type:"paragraph",text:"QAAlpha QABeta"}])}::jsonb,'/excluded/','qa-revision',now()-${age}::interval,now(),${visible})`);
  }
  // PGlite executes the actual single-statement migration. This proves syntax,
  // expression validity and index use; concurrent live-write safety is PostgreSQL's contract.
  await pg.exec(readFileSync(new URL("../migrations/49_smart_fulltext_index.sql",import.meta.url),"utf8"));
  await pg.exec("analyze articles");
});
afterAll(async()=>{await pg.close();});

it("preserves full-content matching, max-query ranking and deterministic top twelve",async()=>{
  const queries=["QAAlpha QABeta","QAAlpha QAGamma","QAAlpha QABeta"];
  const actual=await searchSmartCandidates(db,excluded,queries);
  const expected=await db.execute(sql`with queries as (
      select plainto_tsquery('simple',value) as query from jsonb_array_elements_text(${JSON.stringify(queries)}::jsonb)
    ), candidates as (
      select a.*,to_tsvector('simple',coalesce(a.title,'')||' '||coalesce(a.excerpt,'')||' '||a.body::text) as document
      from smart_public_articles a where a.id<>${excluded}::uuid and a.published_at>=now()-interval '6 months'
    ) select a.id,max(ts_rank_cd(a.document,q.query)) as score from candidates a cross join queries q where a.document@@q.query
    group by a.id,a.published_at order by score desc,a.published_at desc,a.id limit 12`);
  expect(actual.map(row=>row.article_id)).toEqual(expected.map(row=>String(row.id)));
  expect(actual).toHaveLength(12);
  expect(actual.every(row=>row.article.title==="Explicit QA headline"&&row.text.includes("Само в съдържанието"))).toBe(true);
  expect(actual.some(row=>row.article_id===excluded)).toBe(false);
});

it("uses the native expression index and keeps changes to visibility/content immediately effective",async()=>{
  const indexes=await db.execute(sql`select indisvalid,indisready from pg_index where indexrelid='articles_smart_public_fulltext_idx'::regclass`);
  expect(indexes[0]).toMatchObject({indisvalid:true,indisready:true});
  await searchSmartCandidates(db,excluded,["QAAlpha QABeta"]);const query=lastQuery;
  // The fixture is tiny, so force bitmap eligibility to prove the production
  // query's expression/predicate match the GIN index, not its tiny-table cost.
  await db.execute(sql`set enable_seqscan=off`);await db.execute(sql`set enable_indexscan=off`);
  try{const plan=await db.execute(sql`explain (format json) ${query}`);expect(JSON.stringify(plan)).toContain("articles_smart_public_fulltext_idx");}
  finally{await db.execute(sql`reset enable_seqscan`);await db.execute(sql`reset enable_indexscan`);}
  const id=randomUUID();
  await db.execute(sql`insert into articles values(${id}::uuid,'Explicit dynamic QA','',${JSON.stringify([{type:"paragraph",text:"QAImmediatelyIndexedBody"}])}::jsonb,'/dynamic/','v1',now()-interval '1 day',now(),true)`);
  expect((await searchSmartCandidates(db,excluded,["QAImmediatelyIndexedBody"])).map(row=>row.article_id)).toEqual([id]);
  await db.execute(sql`update articles set is_public=false where id=${id}::uuid`);
  expect(await searchSmartCandidates(db,excluded,["QAImmediatelyIndexedBody"])).toEqual([]);
  await db.execute(sql`update articles set is_public=true,body='[]'::jsonb where id=${id}::uuid`);
  expect(await searchSmartCandidates(db,excluded,["QAImmediatelyIndexedBody"])).toEqual([]);
});
