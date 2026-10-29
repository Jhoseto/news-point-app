import {beforeEach,it,expect,vi} from "vitest";
const read=vi.hoisted(()=>vi.fn());
vi.mock("@newspoint/db",()=>({loadRootEnv:vi.fn(),getDb:()=>({})}));
vi.mock("@newspoint/db/smart-settings",()=>({readSmartEnabled:read}));
import {smartAvailability} from "./smart-availability";
beforeEach(()=>vi.clearAllMocks());
it.each([true,false])("returns only the current enabled flag (%s), never cached",async enabled=>{
 read.mockResolvedValue(enabled);const response=await smartAvailability();expect(await response.json()).toEqual({enabled});expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.status).toBe(200);
});
it("fails closed without exposing database errors",async()=>{
 read.mockRejectedValue(Error("private DB details"));const response=await smartAvailability();expect(response.status).toBe(503);expect(await response.json()).toEqual({enabled:false});
});
