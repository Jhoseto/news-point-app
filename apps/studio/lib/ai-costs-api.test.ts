import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({staff:vi.fn(),read:vi.fn()}));
vi.mock("./session",()=>({staffFromRequest:mocks.staff}));
vi.mock("./audit",()=>({withStaffAudit:(handler:unknown)=>handler}));
vi.mock("@newspoint/db",()=>({getDb:()=>({})}));
vi.mock("@newspoint/db/ai-usage",()=>({costFilters:()=>({}),readAiCosts:mocks.read}));
import {GET} from "../app/api/ai-costs/route";
beforeEach(()=>{vi.clearAllMocks();mocks.read.mockResolvedValue({ready:true,articles:[{id:"qa",title:"=QA formula fixture",amount:"0.046"}],operations:[]});});
it.each([[null,401],[{id:"qa",role:"editor"},403]])("denies private financial data before querying",async(staff,status)=>{
 mocks.staff.mockResolvedValue(staff);const result=await GET(new Request("http://studio.test/admin/api/ai-costs/"));expect(result.status).toBe(status);expect(mocks.read).not.toHaveBeenCalled();expect(result.headers.get("cache-control")).toBe("private, no-store");
});
it.each(["admin","master_admin"])("allows %s and protects CSV titles",async role=>{
 mocks.staff.mockResolvedValue({id:"qa",role});const result=await GET(new Request("http://studio.test/admin/api/ai-costs/?export=csv"));expect(result.status).toBe(200);expect(await result.text()).toContain("'=QA formula fixture");expect(result.headers.get("cache-control")).toBe("private, no-store");
});
