import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {smartArticleText,smartChunks} from "@newspoint/content/smart-text";
import {smartArticle,type SmartDb} from "./smart";
import {smartEmbedding,type SmartConfig} from "./smart-provider";
import {packSmartVector,smartSemanticReady} from "./smart-vector";

export async function indexSmartArticle(db:SmartDb,config:SmartConfig,id:string):Promise<"ready"|"indexed"|"outside_window"|"busy"|"uncertain">{
 await smartSemanticReady(db);
 const article=await smartArticle(db,id);
 const eligible=await db.execute(sql`select published_at>=now()-interval '6 months' as eligible from smart_public_articles where id=${id}::uuid`);
 if(!eligible[0]?.eligible)return "outside_window";
 if((await db.execute(sql`select 1 from smart_documents where article_id=${id}::uuid and revision=${article.revision} limit 1`)).length)return "ready";
 const chunks=smartChunks(`${article.title}\n${article.excerpt}\n${smartArticleText(article.body)}`);
 if(chunks.length>50)throw new Error("article_too_large_for_index");
 const token=randomUUID();
 const claim=await db.execute(sql`insert into smart_index_jobs(article_id,revision,lease_token,lease_until,state)
   values(${id}::uuid,${article.revision},${token}::uuid,now()+interval '10 minutes','pending')
   on conflict(article_id) do update set revision=excluded.revision,lease_token=excluded.lease_token,lease_until=excluded.lease_until,state='pending'
   where smart_index_jobs.revision<>excluded.revision or smart_index_jobs.state='ready' returning article_id`);
 if(!claim.length){const rows=await db.execute(sql`select state from smart_index_jobs where article_id=${id}::uuid`);return rows[0]?.state==="uncertain"?"uncertain":"busy";}
 try{
  const vectors=await smartEmbedding(db,config,article,chunks);
  if((await smartArticle(db,id)).revision!==article.revision)throw new Error("article_changed");
  await db.transaction(async tx=>{
   const held=await tx.execute(sql`select article_id from smart_index_jobs where article_id=${id}::uuid and lease_token=${token}::uuid and state='pending' and lease_until>now() for update`);
   if(!held.length)throw new Error("index_lease_expired");
   await tx.execute(sql`delete from smart_documents where article_id=${id}::uuid`);
   for(let i=0;i<chunks.length;i++)await tx.execute(sql`insert into smart_documents(article_id,revision,chunk,text,embedding) values(${id}::uuid,${article.revision},${i},${chunks[i]!},decode(${packSmartVector(vectors[i]!).toString("hex")},'hex'))`);
   await tx.execute(sql`update smart_index_jobs set state='ready' where article_id=${id}::uuid and lease_token=${token}::uuid`);
  });
  return "indexed";
 }catch(error){await db.execute(sql`update smart_index_jobs set state='uncertain' where article_id=${id}::uuid and lease_token=${token}::uuid and state='pending'`);throw error;}
}
