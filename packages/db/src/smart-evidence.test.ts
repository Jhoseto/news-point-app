import {describe,it,expect} from "vitest";
import type {SmartSource} from "@newspoint/content/smart";
import {smartEvidenceRegistry,smartPromptInput} from "./smart-evidence";
const source=(passage:string):SmartSource=>({id:"source-qa",articleId:null,version:"v1",title:"QA",kind:"external",url:"https://example.org/",publishedAt:null,checkedAt:"2026-10-29T00:00:00Z",passage});
describe("Smart evidence encoding",()=>{
  it("preserves every character, source identity, dates and punctuation",()=>{
    const passage=("На 29.10.2026 г. решението е обжалвано. Срокът не е потвърден!\n".repeat(70))+"Край.";
    const result=smartEvidenceRegistry([source(passage)]);
    expect(result.sources[0]!.passages.map(p=>p.text).join("")).toBe(passage);
    for(const part of result.sources[0]!.passages){expect(result.registry.get(part.id)).toEqual({sourceId:"source-qa",quote:part.text});expect(passage.includes(part.text)).toBe(true);}
    expect(result.sourceChecks[0]!.checkedAt).toBe("2026-10-29T00:00:00Z");
    expect(result.sources[0]!.id).toBe("s0");expect(result.sourceRefs.get("s0")).toBe("source-qa");
    expect(result.registry.get("invented")).toBeUndefined();
  });
  it("puts unchanged evidence before questions/clocks without dropping freshness or private history",()=>{
    const first=smartPromptInput({question:"first",now:"one",sources:[source("QA evidence")],history:[{question:"private"}]});
    const second=smartPromptInput({question:"second",now:"two",sources:[{...source("QA evidence"),checkedAt:"later"}],history:[]});
    expect(first.split(',"question"')[0]).toBe(second.split(',"question"')[0]);
    expect(JSON.parse(first)).toMatchObject({history:[{question:"private"}],sourceChecks:[{id:"source-qa",checkedAt:"2026-10-29T00:00:00Z"}]});
    expect(smartPromptInput({value:"QA"})).toBe('{"value":"QA"}');
  });
});
