import {createHmac} from "node:crypto";
import {NextRequest} from "next/server";
import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({read:vi.fn(),reserve:vi.fn()}));
vi.mock("@newspoint/db",()=>({loadRootEnv:vi.fn(),getDb:()=>({execute:vi.fn()})}));
vi.mock("@newspoint/db/smart",async original=>({...await original<typeof import("@newspoint/db/smart")>(),smartReady:async()=>true,smartRateLimit:async()=>{},readSmartSession:mocks.read,reserveSmartTurn:mocks.reserve}));
const secret="qa-only-not-a-real-signing-secret-123456";
vi.mock("@newspoint/db/smart-provider",()=>({smartConfig:()=>({enabled:true,secret:"qa-only-not-a-real-signing-secret-123456",origin:"https://newspoint.bg"})}));
import {smartApi,smartOwner} from "./smart-api";
const article="00000000-0000-4000-8000-000000000001";
function cookie(){const value=`${Math.floor(Date.now()/1000)}.${"a".repeat(48)}`;return `${value}.${createHmac("sha256",secret).update(`smart:v1:${value}`).digest("hex")}`;}
beforeEach(()=>vi.clearAllMocks());
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
