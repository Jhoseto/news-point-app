import {expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({summaries:vi.fn()}));vi.mock("./queries",()=>({getSummariesByIds:mock.summaries}));
import {readerBootstrapWithCards} from "./smart-reader-data";
it.each(["//outside.example/story","/\\outside.example/story","https://outside.example/story"])("never exposes a news card that navigates outside NewsPoint: %s",async path=>{
 mock.summaries.mockResolvedValue(new Map([["qa",{id:"qa",title:"QA",path,publishedAt:new Date(),hero:null}]]));
 const result=await readerBootstrapWithCards({status:"ready",articleId:"current",version:"qa",questions:[],related:{articleId:"qa",title:"QA",path,reason:"QA",publishedAt:new Date().toISOString()}});
 expect(result.related).toBeNull();
});
