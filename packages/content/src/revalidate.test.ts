import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {triggerRevalidate} from "./revalidate";
const request=vi.fn();
beforeEach(()=>{vi.stubGlobal("fetch",request);request.mockReset();request.mockResolvedValue(new Response("{}",{status:200}));vi.stubEnv("REVALIDATE_SECRET","qa-secret");vi.stubEnv("WEB_URL","https://public.example");vi.stubEnv("REVALIDATE_INTERNAL_URL","");});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("uses the configured internal Web origin while preserving canonical WEB_URL",async()=>{
 vi.stubEnv("REVALIDATE_INTERNAL_URL","http://127.0.0.1:3100");expect(await triggerRevalidate(["/","/qa/"])).toEqual({triggered:true,reason:"ok"});
 expect(String(request.mock.calls[0]![0])).toBe("http://127.0.0.1:3100/api/revalidate/");expect(request.mock.calls[0]![1]).toMatchObject({method:"POST",headers:{"x-revalidate-secret":"qa-secret"},body:JSON.stringify({paths:["/","/qa/"]})});expect(process.env.WEB_URL).toBe("https://public.example");
});
it("retains public-origin fallback and fail-soft error handling",async()=>{
 await triggerRevalidate(["/"]);expect(String(request.mock.calls[0]![0])).toBe("https://public.example/api/revalidate/");
 request.mockRejectedValueOnce(Error("QA network"));expect(await triggerRevalidate(["/"])).toEqual({triggered:false,reason:"error"});
});
it("does not send requests without a secret or origin",async()=>{
 vi.stubEnv("REVALIDATE_SECRET","");expect((await triggerRevalidate(["/"])).reason).toBe("no_secret");vi.stubEnv("REVALIDATE_SECRET","qa");vi.stubEnv("WEB_URL","");expect((await triggerRevalidate(["/"])).reason).toBe("no_base_url");expect(request).not.toHaveBeenCalled();
});
