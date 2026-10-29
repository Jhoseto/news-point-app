import {createHmac} from "node:crypto";
import {NextRequest} from "next/server";
import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({read:vi.fn(),reserve:vi.fn(),cached:vi.fn(),summaries:vi.fn(),key:"explicit-qa-only-key"}));
vi.mock("@newspoint/db",()=>({loadRootEnv:vi.fn(),getDb:()=>({execute:vi.fn()})}));
vi.mock("@newspoint/db/smart",async original=>({...await original<typeof import("@newspoint/db/smart")>(),smartReady:async()=>true,smartRateLimit:async()=>{},readSmartSession:mocks.read,reserveSmartTurn:mocks.reserve}));
const secret="qa-only-not-a-real-signing-secret-123456";
vi.mock("@newspoint/db/smart-settings",()=>({readSmartRuntimeConfig:async()=>({enabled:true,key:mocks.key,secret:"qa-only-not-a-real-signing-secret-123456",origin:"https://newspoint.bg"})}));
vi.mock("./queries",()=>({getSummariesByIds:mocks.summaries}));
vi.mock("@newspoint/db/smart-service",()=>({askSmart:mocks.cached}));
import {smartApi,smartOwner} from "./smart-api";
import {SmartError} from "@newspoint/db/smart";
const article="00000000-0000-4000-8000-000000000001";
function cookie(){const value=`${Math.floor(Date.now()/1000)}.${"a".repeat(48)}`;return `${value}.${createHmac("sha256",secret).update(`smart:v1:${value}`).digest("hex")}`;}
beforeEach(()=>{vi.clearAllMocks();mocks.summaries.mockResolvedValue(new Map());mocks.key="explicit-qa-only-key";});
it("accepts a signed first-party identity and rejects tampering or another secret",()=>{
 const valid=cookie();expect(smartOwner(secret,valid)).toMatch(/^[a-f0-9]{64}$/);
 expect(smartOwner(secret,valid.slice(0,-1)+"z")).toBeNull();expect(smartOwner("other-secret",valid)).toBeNull();expect(smartOwner(secret,undefined)).toBeNull();
});
it("rejects cross-site mutations before reading private sessions",async()=>{
 const request=new NextRequest(`https://newspoint.bg/api/smart/article/${article}/ask/`,{method:"POST",headers:{origin:"https://attacker.example","content-type":"application/json"},body:"{}"});
 const response=await smartApi(request,"ask",article);expect(response.status).toBe(403);expect(mocks.read).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();
});
it("does not read a transcript without a valid owner cookie",async()=>{
 const response=await smartApi(new NextRequest(`https://newspoint.bg/api/smart/session/${article}/`),"history",article);
 expect(response.status).toBe(404);expect(mocks.read).not.toHaveBeenCalled();expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("rejects cross-site preparation requests even though they use GET",async()=>{
 const request=new NextRequest(`https://newspoint.bg/api/smart/article/${article}/bootstrap/`,{headers:{"sec-fetch-site":"cross-site"}});
 expect((await smartApi(request,"bootstrap",article)).status).toBe(403);
});
it("rejects oversized JSON before any reservation",async()=>{
 const request=new NextRequest(`https://newspoint.bg/api/smart/article/${article}/ask/`,{method:"POST",headers:{origin:"https://newspoint.bg",cookie:`np_smart=${cookie()}`,"content-type":"application/json"},body:JSON.stringify({question:"x".repeat(5000)})});
 const response=await smartApi(request,"ask",article);expect(response.status).toBe(413);expect(mocks.reserve).not.toHaveBeenCalled();
});
it("serves a ready answer directly and keeps full source text on the server",async()=>{
 mocks.read.mockResolvedValue({articleId:article});
 mocks.cached.mockResolvedValue({id:article,usedQuestions:1,maxQuestions:3,updated:false,turns:[{id:article,question:"QA",status:"completed",cached:true,answer:{status:"insufficient",blocks:[],followUps:[],checkedAt:"2026-10-29",expiresAt:"2026-10-30",sources:[{id:"qa",passage:"PRIVATE_SOURCE_PASSAGE_QA",title:"QA citation",url:"https://example.org"}]}}]});
 const request=new NextRequest(`https://newspoint.bg/api/smart/article/${article}/ask/`,{method:"POST",headers:{origin:"https://newspoint.bg",cookie:`np_smart=${cookie()}`,"content-type":"application/json"},body:JSON.stringify({sessionId:article,requestKey:article,question:"Explicit QA question",questionId:"qa-public"})});
 const response=await smartApi(request,"ask",article);expect(response.status).toBe(200);expect(await response.text()).not.toContain("PRIVATE_SOURCE_PASSAGE_QA");
 expect(mocks.cached.mock.calls[0]?.[4]).toBe(true);expect(mocks.reserve).not.toHaveBeenCalled();
});
it("queues a cache miss without invoking the paid path in the API handler",async()=>{
 mocks.read.mockResolvedValue({articleId:article,id:article,turns:[]});mocks.cached.mockResolvedValue(null);
 const request=new NextRequest(`https://newspoint.bg/api/smart/article/${article}/ask/`,{method:"POST",headers:{origin:"https://newspoint.bg",cookie:`np_smart=${cookie()}`,"content-type":"application/json"},body:JSON.stringify({sessionId:article,requestKey:article,question:"Explicit QA question"})});
 expect((await smartApi(request,"ask",article)).status).toBe(202);expect(mocks.reserve).toHaveBeenCalledTimes(1);expect(mocks.cached).not.toHaveBeenCalled();
});

it("does not enqueue preparation or questions when the selected provider key is missing",async()=>{
 mocks.key="";
 const response=await smartApi(new NextRequest(`https://newspoint.bg/api/smart/article/${article}/bootstrap/`),"bootstrap",article);
 expect(response.status).toBe(503);expect(await response.json()).toMatchObject({code:"key"});expect(mocks.reserve).not.toHaveBeenCalled();
});

it("renders references only as published internal article cards with real media",async()=>{
 const other='00000000-0000-4000-8000-000000000002';mocks.read.mockResolvedValue({articleId:article});
 mocks.summaries.mockResolvedValue(new Map([[other,{id:other,path:'/real-internal-qa/',title:'QA наша публикация',publishedAt:new Date('2026-10-29'),hero:{url:'/media/news/qa.jpg',width:640,height:480,alt:'QA',caption:'',credit:''}}]]));
 mocks.cached.mockResolvedValue({id:article,usedQuestions:1,maxQuestions:3,updated:false,turns:[{id:article,question:'QA',status:'completed',cached:true,answer:{status:'insufficient',blocks:[{text:'QA факт',sourceIds:['own','outside']}],followUps:[],checkedAt:'2026-10-29',expiresAt:'2026-10-30',sources:[{id:'own',articleId:other,kind:'newspoint',title:'QA',url:'https://newspoint.bg/real-internal-qa/',passage:'PRIVATE'},{id:'outside',articleId:null,kind:'external',title:'External',url:'https://external.example/test',passage:'PRIVATE'}]}}]});
 const request=new NextRequest(`https://newspoint.bg/api/smart/article/${article}/ask/`,{method:'POST',headers:{origin:'https://newspoint.bg',cookie:`np_smart=${cookie()}`,'content-type':'application/json'},body:JSON.stringify({sessionId:article,requestKey:article,question:'Explicit QA question',questionId:'qa-public'})});
 const response=await smartApi(request,'ask',article);expect(response.status).toBe(200);const body=await response.json();expect(body.turns[0].cards[0]).toMatchObject({articleId:other,path:'/real-internal-qa/',hero:{url:'/media/news/qa.jpg'}});expect(JSON.stringify(body)).not.toContain('external.example');expect(JSON.stringify(body)).not.toContain('PRIVATE');
});

it("returns the locked quota and accepted pending turn without another history read",async()=>{
 mocks.read.mockResolvedValue({articleId:article,id:article,revision:"qa",usedQuestions:1,maxQuestions:3,updated:false,turns:[]});
 mocks.reserve.mockResolvedValueOnce({id:article,status:"pending",session_used:2});
 const request=new NextRequest(`https://newspoint.bg/api/smart/article/${article}/ask/`,{method:"POST",headers:{origin:"https://newspoint.bg",cookie:`np_smart=${cookie()}`,"content-type":"application/json"},body:JSON.stringify({sessionId:article,requestKey:article,question:"Explicit QA question"})});
 const response=await smartApi(request,"ask",article);expect(response.status).toBe(202);const payload=await response.json();expect(payload.usedQuestions).toBe(2);expect(payload.turns).toEqual([expect.objectContaining({id:article,status:"pending",answer:null,cached:false})]);expect(mocks.read).toHaveBeenCalledTimes(1);expect(mocks.cached).not.toHaveBeenCalled();expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("rejects a fourth private question using the server reservation even if the tab has stale quota",async()=>{
 mocks.read.mockResolvedValue({articleId:article,id:article,usedQuestions:2,maxQuestions:3,updated:false,turns:[]});
 mocks.reserve.mockRejectedValueOnce(new SmartError("question_limit",429,"Използва трите въпроса."));
 const request=new NextRequest(`https://newspoint.bg/api/smart/article/${article}/ask/`,{method:"POST",headers:{origin:"https://newspoint.bg",cookie:`np_smart=${cookie()}`,"content-type":"application/json"},body:JSON.stringify({sessionId:article,requestKey:article,question:"Explicit QA fourth question"})});
 const response=await smartApi(request,"ask",article);expect(response.status).toBe(429);expect(await response.json()).toMatchObject({code:"question_limit"});expect(mocks.cached).not.toHaveBeenCalled();
});
it("does not accept a client-provided quota reset or counter",async()=>{
 const request=new NextRequest(`https://newspoint.bg/api/smart/article/${article}/ask/`,{method:"POST",headers:{origin:"https://newspoint.bg",cookie:`np_smart=${cookie()}`,"content-type":"application/json"},body:JSON.stringify({sessionId:article,requestKey:article,question:"Explicit QA",usedQuestions:0,quotaResetAt:"1970-01-01"})});
 expect((await smartApi(request,"ask",article)).status).toBe(400);expect(mocks.reserve).not.toHaveBeenCalled();
});
