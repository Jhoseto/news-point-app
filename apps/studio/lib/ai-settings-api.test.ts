import {beforeEach,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({staff:vi.fn(),read:vi.fn(),write:vi.fn(),evidence:vi.fn()}));
vi.mock("./session",()=>({staffFromRequest:mocks.staff}));
vi.mock("./auth",()=>({studioOrigins:()=>({trusted:["https://studio.test"]})}));
vi.mock("./audit",()=>({withStaffAudit:(handler:unknown)=>handler}));
vi.mock("./audit-context",()=>({auditEvidence:mocks.evidence}));
vi.mock("./articles",()=>({EditorError:class extends Error{constructor(readonly status:number,readonly code:string,message:string,readonly details?:unknown){super(message);}}}));
vi.mock("@newspoint/db",()=>({getDb:()=>({}),loadRootEnv:vi.fn()}));
vi.mock("@newspoint/db/smart-settings",()=>({readSmartProviderSettings:mocks.read,writeSmartProvider:mocks.write}));
import {GET,POST} from "../app/api/ai-settings/route";
import {SmartError} from "@newspoint/db/smart";
const settings={ready:true,provider:"minimax",version:1,updatedAt:null,options:[{provider:"minimax",label:"MiniMax",model:"MiniMax-M3.1-Flash",modelLabel:"M3.1 Flash",available:true},{provider:"openai",label:"OpenAI",model:"gpt-6.1-sol",modelLabel:"GPT-6.1 Sol",available:true}]};
beforeEach(()=>{vi.clearAllMocks();mocks.read.mockResolvedValue(settings);mocks.staff.mockResolvedValue({id:"qa-admin",role:"admin"});mocks.write.mockResolvedValue({before:{provider:"minimax",version:1},after:{provider:"openai",version:2},settings:{...settings,provider:"openai",version:2}});});
const request=(body:unknown={provider:"openai",version:1},origin="https://studio.test")=>new Request("https://studio.test/admin/api/ai-settings/",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
it.each([[null,401],[{id:"qa-editor",role:"editor"},403]])("protects settings reads (%j)",async(staff,status)=>{
 mocks.staff.mockResolvedValue(staff);const response=await GET(new Request("https://studio.test/admin/api/ai-settings/"));expect(response.status).toBe(status);expect(mocks.read).not.toHaveBeenCalled();
});
it.each(["admin","master_admin"])("allows %s to read the private selector",async role=>{
 mocks.staff.mockResolvedValue({id:"qa",role});const response=await GET(new Request("https://studio.test/admin/api/ai-settings/"));expect(response.status).toBe(200);expect(await response.json()).toEqual(settings);expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("blocks a cross-site write and editor access",async()=>{
 expect((await POST(request(undefined,"https://outside.test"))).status).toBe(403);expect(mocks.write).not.toHaveBeenCalled();
 mocks.staff.mockResolvedValue({id:"qa",role:"editor"});expect((await POST(request())).status).toBe(403);expect(mocks.write).not.toHaveBeenCalled();
});
it("persists only the provider and version and audits the before/after choice",async()=>{
 const response=await POST(request());expect(response.status).toBe(200);expect(await response.json()).toMatchObject({provider:"openai",version:2});expect(mocks.write).toHaveBeenCalledWith({}, {provider:"openai",version:1},{id:"qa-admin",role:"admin"});expect(mocks.evidence).toHaveBeenCalledWith({provider:"minimax",version:1},{provider:"openai",version:2});expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it.each([{provider:"astra",version:1},{provider:"openai",version:1,key:"forbidden"},{provider:"minimax",version:0}])("rejects unsupported selection fields (%j)",async body=>{
 expect((await POST(request(body))).status).toBe(400);expect(mocks.write).not.toHaveBeenCalled();
});
it.each([["conflict",409],["key",422],["migration",503]] as const)("keeps the %s failure explicit with no fallback",async(code,status)=>{
 mocks.write.mockRejectedValue(new SmartError(code,status,"Explicit QA settings failure"));const response=await POST(request());expect(response.status).toBe(status);expect(mocks.evidence).not.toHaveBeenCalled();
});
