import {sql} from "drizzle-orm";
import {SmartError,type SmartDb} from "./smart";

export const SMART_VECTOR_DIMENSIONS=1536;
/** Float32 is also the precision used by the former pgvector storage. */
export function packSmartVector(values:readonly number[]):Buffer{
  if(values.length!==SMART_VECTOR_DIMENSIONS||values.some(x=>!Number.isFinite(x)))throw new Error("invalid_embedding");
  const bytes=Buffer.allocUnsafe(values.length*4);
  let norm=0;
  values.forEach((value,i)=>{bytes.writeFloatLE(value,i*4);const stored=bytes.readFloatLE(i*4);if(!Number.isFinite(stored))throw new Error("invalid_embedding");norm+=stored*stored;});
  if(!norm||!Number.isFinite(norm))throw new Error("invalid_embedding");return bytes;
}
export function unpackSmartVector(bytes:Uint8Array):Float32Array{
  if(bytes.byteLength!==SMART_VECTOR_DIMENSIONS*4)throw new Error("invalid_embedding_size");
  const data=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),result=new Float32Array(SMART_VECTOR_DIMENSIONS);
  let norm=0;
  for(let i=0;i<result.length;i++){const value=data.readFloatLE(i*4);if(!Number.isFinite(value))throw new Error("invalid_embedding");result[i]=value;norm+=value*value;}
  if(!norm)throw new Error("zero_embedding");norm=Math.sqrt(norm);
  for(let i=0;i<result.length;i++)result[i]!/=norm;
  return result;
}
type Entry={articleId:string;revision:string;chunk:number;publishedAt:number;vector:Float32Array};
type Snapshot={signature:string;entries:Entry[]};
type State={snapshot?:Snapshot;loading?:Promise<Snapshot>};
const snapshots=new WeakMap<object,State>();
async function metadata(db:SmartDb){
 const rows=await db.execute(sql`select md5(coalesce(string_agg(d.article_id::text||':'||d.chunk::text||':'||d.revision||':'||d.indexed_at::text,',' order by d.article_id,d.chunk),'')) as signature,
   extract(epoch from (now()-interval '6 months'))*1000 as cutoff
   from smart_documents d join smart_public_articles a on a.id=d.article_id and a.revision=d.revision
   where a.published_at>=now()-interval '6 months' and d.model='text-embedding-3-small'`);
 return {signature:String(rows[0]!.signature),cutoff:Number(rows[0]!.cutoff)};
}
async function load(db:SmartDb,signature:string):Promise<Snapshot>{
 const entries:Entry[]=[];let lastId="00000000-0000-0000-0000-000000000000",lastChunk=-1;
 // Bounded pages avoid holding a second whole-archive wire response in memory.
 for(;;){
  const rows=await db.execute(sql`select d.article_id,d.revision,d.chunk,d.embedding,a.published_at from smart_documents d
    join smart_public_articles a on a.id=d.article_id and a.revision=d.revision
    where a.published_at>=now()-interval '6 months' and d.model='text-embedding-3-small'
      and (d.article_id,d.chunk)>(${lastId}::uuid,${lastChunk}) order by d.article_id,d.chunk limit 500`);
  for(const row of rows)entries.push({articleId:String(row.article_id),revision:String(row.revision),chunk:Number(row.chunk),publishedAt:new Date(row.published_at as string).getTime(),vector:unpackSmartVector(row.embedding as Uint8Array)});
  if(rows.length<500)break;
  const last=rows.at(-1)!;lastId=String(last.article_id);lastChunk=Number(last.chunk);
 }
 return {signature,entries};
}
/** Exact cosine over all eligible vectors, with no lexical/title prefilter or ANN recall loss. */
export async function searchSmartVectors(db:SmartDb,query:readonly number[],excludeArticle:string,limit=8){
 const current=await metadata(db);let state=snapshots.get(db);
 if(!state){state={};snapshots.set(db,state);}
 if(state.snapshot?.signature!==current.signature){
  if(!state.loading)state.loading=load(db,current.signature).then(snapshot=>(state!.snapshot=snapshot)).finally(()=>{delete state!.loading;});
  await state.loading;
 }
 const normalized=unpackSmartVector(packSmartVector(query)),top:{articleId:string;revision:string;chunk:number;score:number}[]=[];
 for(const entry of state.snapshot!.entries){
  if(entry.articleId===excludeArticle||entry.publishedAt<current.cutoff)continue;
  let score=0;for(let i=0;i<normalized.length;i++)score+=normalized[i]!*entry.vector[i]!;
  if(top.length===limit&&score<=top.at(-1)!.score)continue;
  top.push({articleId:entry.articleId,revision:entry.revision,chunk:entry.chunk,score});top.sort((a,b)=>b.score-a.score||a.articleId.localeCompare(b.articleId)||a.chunk-b.chunk);if(top.length>limit)top.pop();
 }
 if(!top.length)return [];
 const rows=await db.execute(sql`select d.article_id,d.text from jsonb_to_recordset(${JSON.stringify(top)}::jsonb) as hit("articleId" uuid,revision text,chunk integer,score double precision)
   join smart_documents d on d.article_id=hit."articleId" and d.chunk=hit.chunk and d.revision=hit.revision
   join smart_public_articles a on a.id=d.article_id and a.revision=d.revision
   where a.published_at>=now()-interval '6 months' order by hit.score desc,hit."articleId",hit.chunk`);
 return rows.map(row=>({article_id:String(row.article_id),text:String(row.text)}));
}
export async function smartSemanticReady(db:SmartDb){
 const rows=await db.execute(sql`select data_type from information_schema.columns where table_schema='public' and table_name='smart_documents' and column_name='embedding'`);
 if(rows[0]?.data_type!=="bytea")throw new SmartError("index_missing",503,"Смисловият индекс очаква подготовка.");
}
