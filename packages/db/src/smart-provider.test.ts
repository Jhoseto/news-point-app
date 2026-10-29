import {beforeEach,describe,expect,it,vi} from "vitest";
import {z} from "zod";
import {aiCostUsd,AI_RATES} from "@newspoint/content/smart";
import type {SmartDb,SmartArticle} from "./smart";
const ledger=vi.hoisted(()=>({start:vi.fn(),settle:vi.fn(),unknown:vi.fn()}));
vi.mock("./ai-usage",async original=>({...await original<typeof import("./ai-usage")>(),startAiOperation:ledger.start,settleAiOperation:ledger.settle,markAiUnknown:ledger.unknown}));
import {smartAi,smartConfig,smartEmbedding,smartJson,smartProviderRequest,smartMiniMaxSearch} from "./smart-provider";
import {indexSmartArticle} from "./smart-index";
import {reconcileAiCosts} from "../../../apps/worker/src/ai-cost-reconciliation";
const db={} as SmartDb;
const article={id:"00000000-0000-4000-8000-000000000001",title:"Explicit QA fixture",path:"/qa/"} as SmartArticle;
const config=()=>smartConfig({MINIMAX_API_KEY:"minimax-test-only",OPENAI_API_KEY:"openai-test-only",OPENAI_PROJECT_ID:"openai-project"});
const reply=(extra:Record<string,unknown>={})=>Response.json({id:"qa-response",model:"MiniMax-M3.1-Flash",status:"completed",usage:{input_tokens:100,output_tokens:60,input_tokens_details:{cached_tokens:20},output_tokens_details:{reasoning_tokens:40}},output:[{type:"message",content:[{type:"output_text",text:'{"valid":true}'}]}],...extra});
beforeEach(()=>{vi.clearAllMocks();vi.unstubAllGlobals();ledger.start.mockResolvedValue("qa-ledger");});
describe("Smart provider isolation (offline)",()=>{
  it("keeps OpenAI search discovery URLs when the summary has no inline citations",async()=>{
    const result=await smartAi(db,smartConfig({SMART_PROVIDER:"openai",OPENAI_API_KEY:"qa-only"}),article,"research",{},vi.fn().mockResolvedValue(reply({model:"gpt-6-luna",output:[{type:"web_search_call",status:"completed",action:{sources:[{type:"url",url:"https://example.org/document",title:"Official document"},{type:"url",url:null}]}},{type:"message",content:[{type:"output_text",text:"Search summary, not evidence",annotations:[]}]}]})));
    expect(result.sources).toEqual([{url:"https://example.org/document",title:"Official document"}]);
  });
  it("does not accept an OpenAI research summary without a completed search",async()=>{
    await expect(smartAi(db,smartConfig({SMART_PROVIDER:"openai",OPENAI_API_KEY:"qa-only"}),article,"research",{},vi.fn().mockResolvedValue(reply({model:"gpt-6-luna"})))).rejects.toMatchObject({code:"research_not_performed"});
  });
  it("makes OpenAI structured schemas strict at every object without mutating the Zod schema",()=>{
    const schema=z.toJSONSchema(z.object({valid:z.boolean(),note:z.string().optional(),items:z.array(z.object({value:z.number().default(1)}))}));
    const request=smartProviderRequest(smartConfig({SMART_PROVIDER:"openai",OPENAI_API_KEY:"qa"}),{text:{format:{type:"json_schema",strict:true,schema}}});
    const strict=(request.body.text as any).format.schema;
    expect(strict.required).toEqual(["valid","note","items"]);expect(strict.additionalProperties).toBe(false);expect(strict.properties.items.items.required).toEqual(["value"]);expect(strict.properties.items.items.additionalProperties).toBe(false);expect(JSON.stringify(strict)).not.toContain('"default"');expect(schema.required).not.toContain("note");
  });
  it("does one direct search, keeps credentials at its fixed host, and never prices it as zero",async()=>{
    const network=vi.fn().mockResolvedValue(Response.json({base_resp:{status_code:0},organic:[{title:"Official QA",link:"https://example.org/proof",snippet:"Not evidence"},{title:"Bad",link:"https://secret@example.org/"},{title:"Bad",link:"javascript:alert(1)"}]}));
    expect(await smartMiniMaxSearch(db,config(),article,"QA query",network)).toEqual([{title:"Official QA",url:"https://example.org/proof"}]);
    expect(network).toHaveBeenCalledTimes(1);
    expect(network.mock.calls[0]![0]).toBe("https://api.minimax.io/v1/coding_plan/search");
    expect(network.mock.calls[0]![1]).toMatchObject({redirect:"error",body:'{"q":"QA query"}',headers:{Authorization:"Bearer minimax-test-only"}});
    expect(ledger.start.mock.calls[0]![1]).toMatchObject({operation:"research_search",model:"MiniMax-Web-Search",articleId:article.id});
    expect(ledger.settle.mock.calls[0]![3]).toMatchObject({searches:1});
    expect(AI_RATES["MiniMax-Web-Search"]).toBeUndefined();
  });
  it("does not retry a failed direct search or substitute memory/snippets",async()=>{
    const network=vi.fn().mockResolvedValue(Response.json({base_resp:{status_code:1004},organic:[{title:"QA",link:"https://example.org/"}]}));
    await expect(smartMiniMaxSearch(db,config(),article,"QA",network)).rejects.toMatchObject({code:"provider"});
    expect(network).toHaveBeenCalledTimes(1);
    expect(ledger.unknown).toHaveBeenCalled();
  });
  it("explicitly uses low for the draft and the separate calibrated verifier",async()=>{
    const network=vi.fn().mockImplementation(async()=>reply());vi.stubGlobal("fetch",network);
    await smartJson(db,config(),article,"answer","QA",{},z.object({valid:z.boolean()}));
    await smartJson(db,config(),article,"verification","QA",{},z.object({valid:z.boolean()}));
    expect(JSON.parse(network.mock.calls[0]![1].body).reasoning.effort).toBe("low");
    expect(JSON.parse(network.mock.calls[1]![1].body).reasoning.effort).toBe("low");
  });
  it("routes repeated article context consistently without mixing revisions or putting private text in the key",async()=>{
    const network=vi.fn().mockImplementation(async()=>reply());vi.stubGlobal("fetch",network);
    const current={...article,revision:"qa-v1"};
    for(const [item,question] of [[current,"first private question"],[current,"second private question"],[{...current,revision:"qa-v2"},"first private question"]] as const){
      await smartJson(db,config(),item,"answer","QA",{question},z.object({valid:z.boolean()}));
    }
    const keys=network.mock.calls.map(call=>JSON.parse(call[1].body).prompt_cache_key);
    expect(keys[0]).toBe(keys[1]);expect(keys[2]).not.toBe(keys[0]);expect(keys[0]).toMatch(/^np-smart:[a-f0-9]{64}$/);
    expect(keys[0]).not.toContain("private");expect(keys[0]).not.toContain(config().key);
  });
  it("defaults every stage to MiniMax and never falls back to an OpenAI key",()=>{
    expect(config()).toMatchObject({provider:"minimax",model:"MiniMax-M3.1-Flash",preparationModel:"MiniMax-M3.1-Flash",key:"minimax-test-only",project:null});
    expect(smartConfig({OPENAI_API_KEY:"present"}).key).toBe("");
    expect(()=>smartConfig({SMART_PROVIDER:"untrusted"})).toThrow();
  });
  it("does not contact OpenAI for cost reconciliation in MiniMax mode",async()=>{
    vi.stubEnv("SMART_PROVIDER","minimax");vi.stubEnv("OPENAI_COSTS_READ_KEY","qa");vi.stubEnv("OPENAI_PROJECT_ID","qa");
    try{const network=vi.fn();expect(await reconcileAiCosts(db,network)).toBe(false);expect(network).not.toHaveBeenCalled();}finally{vi.unstubAllEnvs();}
  });
  it("retains an explicitly selected OpenAI configuration for manual rollback",()=>{
    expect(smartConfig({SMART_PROVIDER:"openai",OPENAI_API_KEY:"qa"})).toMatchObject({provider:"openai",model:"gpt-6.1-sol",preparationModel:"gpt-6-luna",key:"qa"});
  });
  it("supports M3 without enabling a second provider",()=>{
    const c=smartConfig({MINIMAX_SMART_MODEL:"MiniMax-M3"});
    expect(smartProviderRequest(c,{})).toMatchObject({url:"https://api.minimax.io/v1/responses",body:{model:"MiniMax-M3",service_tier:"standard"}});
  });
  it("adapts search fields to MiniMax's supported API",()=>{
    const {body}=smartProviderRequest(config(),{tools:[{type:"web_search",external_web_access:true}],include:["web_search_call.action.sources"],tool_choice:"required",max_tool_calls:3});
    expect(body).toMatchObject({tools:[{type:"web_search"}],tool_choice:"auto",reasoning:{effort:"medium"}});
    expect(body).not.toHaveProperty("service_tier");expect(body).not.toHaveProperty("include");expect(body).not.toHaveProperty("max_tool_calls");
  });
  it("sends only the MiniMax key to its fixed host and records that provider",async()=>{
    const network=vi.fn().mockResolvedValue(reply());
    await smartAi(db,config(),article,"answer",{},network);
    expect(network).toHaveBeenCalledTimes(1);
    const [url,options]=network.mock.calls[0]!;
    expect(url).toBe("https://api.minimax.io/v1/responses");
    expect(options.headers.Authorization).toBe("Bearer minimax-test-only");
    expect(options.headers).not.toHaveProperty("OpenAI-Project");expect(options.redirect).toBe("error");
    expect(ledger.start.mock.calls[0]![1]).toMatchObject({provider:"minimax",model:"MiniMax-M3.1-Flash",articleId:article.id});
    expect(ledger.settle.mock.calls[0]![3]).toMatchObject({input:100,output:60,reasoning:40,cachedInput:20,searches:0});
  });
  it("never makes an OpenAI embedding call or touches the old index in MiniMax mode",async()=>{
    const network=vi.fn();vi.stubGlobal("fetch",network);
    await expect(smartEmbedding(db,config(),article,["qa"])).rejects.toThrow();
    expect(await indexSmartArticle(db,config(),article.id)).toBe("ready");
    expect(network).not.toHaveBeenCalled();expect(ledger.start).not.toHaveBeenCalled();
  });
  it("fails closed before any request when the MiniMax key is missing",async()=>{
    const network=vi.fn();
    await expect(smartAi(db,smartConfig({OPENAI_API_KEY:"present"}),article,"answer",{},network)).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();expect(ledger.start).not.toHaveBeenCalled();
  });
  it("does not fall back or retry an HTTP error",async()=>{
    const network=vi.fn().mockResolvedValue(Response.json({error:{message:"QA"}},{status:401}));
    await expect(smartAi(db,config(),article,"answer",{},network)).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(1);expect(network.mock.calls[0]![0]).toContain("api.minimax.io");
  });
  it("keeps schema validation even without provider-enforced JSON",async()=>{
    const network=vi.fn().mockImplementation(async()=>reply({output:[{content:[{type:"output_text",text:'{"valid":"untrusted"}'}]}]}));vi.stubGlobal("fetch",network);
    await expect(smartJson(db,config(),article,"verification","QA",{},z.object({valid:z.boolean()}))).rejects.toThrow();
    const body=JSON.parse(network.mock.calls[0]![1].body);
    expect(body.instructions).toContain('"type":"boolean"');expect(body).not.toHaveProperty("text");
    expect(ledger.settle).toHaveBeenCalledTimes(2);
  });
  it("repairs a MiniMax schema violation once without relaxing the schema",async()=>{
    const network=vi.fn().mockResolvedValueOnce(reply({output:[{content:[{type:"output_text",text:'{"explanation":"too long"}'}]}]})).mockResolvedValueOnce(reply({output:[{content:[{type:"output_text",text:'{"explanation":"OK"}'}]}]}));vi.stubGlobal("fetch",network);
    expect(await smartJson(db,config(),article,"assessment","QA",{},z.object({explanation:z.string().max(3)}))).toEqual({explanation:"OK"});
    expect(network).toHaveBeenCalledTimes(2);expect(ledger.start.mock.calls[1]![1]).toMatchObject({operation:"assessment_format_repair",provider:"minimax"});
  });
  it("requires actual search execution and discovers URLs without treating snippets as evidence",async()=>{
    const network=vi.fn().mockResolvedValueOnce(reply()).mockResolvedValueOnce(reply({output:[{type:"web_search_call",status:"completed"},{type:"message",content:[{type:"output_text",text:"Source: https://example.org/official."}]}]}));
    await expect(smartAi(db,config(),article,"research",{tools:[{type:"web_search"}]},network)).rejects.toThrow();
    expect((await smartAi(db,config(),article,"research",{tools:[{type:"web_search"}]},network)).sources).toEqual([{url:"https://example.org/official",title:"https://example.org/official."}]);
    expect(ledger.settle.mock.calls[1]![3]).toMatchObject({searches:1});
  });
  it("calculates M3.1 token and search charges with reasoning already in output",()=>{
    expect(aiCostUsd({input:8000,cachedInput:0,cacheWrite:0,output:2000,reasoning:1000,searches:1},AI_RATES["MiniMax-M3.1-Flash"]!)).toBe("0.012400000000");
  });
});
