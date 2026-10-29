import {it,expect} from "vitest";
import {publicSmartBootstrap} from "./smart-preparation";
import type {SmartBootstrap} from "@newspoint/content/smart";
it("does not serialize internal preparation metadata into reader responses",()=>{
 const payload={status:"ready" as const,articleId:"qa",version:"qa",related:null,questions:[],retrievalRecipe:{internal:"QA fixture"},internalSecret:"fixture"};
 expect(publicSmartBootstrap(payload as SmartBootstrap)).toEqual({status:"ready",articleId:"qa",version:"qa",related:null,questions:[]});
});
