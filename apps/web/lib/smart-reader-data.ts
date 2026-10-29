import "server-only";
import {readerSmartSession,type SmartBootstrap,type SmartCard,type SmartSession} from "@newspoint/content/smart";
import {getSummariesByIds} from "./queries";

async function cardsFor(ids:string[]):Promise<Map<string,SmartCard>>{
  if(!ids.length)return new Map();
  const articles=await getSummariesByIds([...new Set(ids)]);
  return new Map([...articles].filter(([,a])=>{
    try{return a.path.startsWith("/")&&!a.path.includes("\\")&&new URL(a.path,"https://newspoint.bg").origin==="https://newspoint.bg";}catch{return false;}
  }).map(([id,a])=>[id,{articleId:id,title:a.title,path:a.path,publishedAt:new Date(a.publishedAt).toISOString(),reason:"",hero:a.hero}]));
}
export async function readerSessionWithCards<T extends SmartSession>(session:T){
  const safe=readerSmartSession(session);
  const relatedIds=(turn:SmartSession["turns"][number])=>[...new Set([...(turn.answer?.relatedArticleIds??[]),...(turn.answer?.sources.filter(source=>source.kind==="newspoint"&&source.articleId).map(source=>source.articleId!)??[])])].slice(0,3);
  const ids=safe.turns.flatMap(relatedIds);
  const cards=await cardsFor(ids);
  return {...safe,turns:safe.turns.map(turn=>({...turn,cards:relatedIds(turn).flatMap(id=>cards.has(id)?[cards.get(id)!]:[])}))};
}
export async function readerBootstrapWithCards(bootstrap:SmartBootstrap):Promise<SmartBootstrap>{
  if(!bootstrap.related)return bootstrap;
  const card=(await cardsFor([bootstrap.related.articleId])).get(bootstrap.related.articleId);
  return {...bootstrap,related:card?{...card,reason:bootstrap.related.reason}:null};
}
