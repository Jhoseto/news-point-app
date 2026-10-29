import {expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({summaries:vi.fn()}));vi.mock("./queries",()=>({getSummariesByIds:mock.summaries}));
import {readerBootstrapWithCards,readerSessionWithCards} from "./smart-reader-data";
it.each(["//outside.example/story","/\\outside.example/story","https://outside.example/story"])("never exposes a news card that navigates outside NewsPoint: %s",async path=>{
 mock.summaries.mockResolvedValue(new Map([["qa",{id:"qa",title:"QA",path,publishedAt:new Date(),hero:null}]]));
 const result=await readerBootstrapWithCards({status:"ready",articleId:"current",version:"qa",questions:[],related:{articleId:"qa",title:"QA",path,reason:"QA",publishedAt:new Date().toISOString()}});
 expect(result.related).toBeNull();
});
it("renders a verified supplementary article as a real card even without a block citation",async()=>{
 const id="00000000-0000-4000-8000-000000000002",date=new Date().toISOString();
 mock.summaries.mockResolvedValue(new Map([[id,{id,title:"Real summary fixture",path:"/related-coverage/",publishedAt:new Date(date),hero:{url:"/media/qa.jpg",width:100,height:100,alt:"QA"}}]]));
 const source={id:"np:qa",articleId:id,version:"qa",kind:"newspoint" as const,title:"Old cached title",url:"https://newspoint.bg/related-coverage/",passage:"Server-only evidence",publishedAt:date,checkedAt:date};
 const session={id:"qa",usedQuestions:1,maxQuestions:5,updated:false,turns:[{id:"qa",question:"QA",status:"completed" as const,cached:false,answer:{status:"insufficient" as const,blocks:[{text:"QA answer",sourceIds:[]}],sources:[source],relatedArticleIds:[id],followUps:[],checkedAt:date,expiresAt:date}}]};
 const result=await readerSessionWithCards(session);
 expect(result.turns[0]?.cards).toEqual([expect.objectContaining({articleId:id,title:"Real summary fixture",path:"/related-coverage/",hero:expect.objectContaining({url:"/media/qa.jpg"})})]);
 expect(result.turns[0]?.answer?.sources[0]?.passage).toBe("");
});
it("does not materialize an unapproved related id that has no validated NewsPoint source",async()=>{
 const date=new Date().toISOString(),id="00000000-0000-4000-8000-000000000002";
 mock.summaries.mockClear();
 const result=await readerSessionWithCards({id:"qa",usedQuestions:1,maxQuestions:5,updated:false,turns:[{id:"qa",question:"QA",status:"completed",cached:false,answer:{status:"insufficient",blocks:[{text:"QA",sourceIds:[]}],sources:[],relatedArticleIds:[id],followUps:[],checkedAt:date,expiresAt:date}}]});
 expect(result.turns[0]?.cards).toEqual([]);expect(mock.summaries).not.toHaveBeenCalled();
});
