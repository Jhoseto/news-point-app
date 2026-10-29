import {EventEmitter} from "node:events";
import {beforeEach,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({lookup:vi.fn(),request:vi.fn()}));
vi.mock("node:dns/promises",()=>({lookup:mocks.lookup}));
vi.mock("node:https",()=>({request:mocks.request}));
import {fetchSmartPage} from "./smart-web";
beforeEach(()=>{vi.clearAllMocks();mocks.lookup.mockResolvedValue([{address:"8.8.8.8",family:4}]);});
function page(bytes:number){
 const request=new EventEmitter() as any;request.destroy=vi.fn((error:Error)=>queueMicrotask(()=>request.emit("error",error)));
 request.end=()=>queueMicrotask(()=>{const response=new EventEmitter() as any;response.statusCode=200;response.headers={"content-type":"text/html"};response.resume=vi.fn();mocks.request.mock.calls.at(-1)![2](response);response.emit("data",Buffer.from('<html><p>'+"Verified public source passage. ".repeat(20)+'</p><!--'+"x".repeat(bytes)+'--></html>'));response.emit("end");});
 mocks.request.mockReturnValue(request);return request;
}
it("reads a modern page above the old 750KB threshold without increasing evidence length",async()=>{
 page(900_000);const result=await fetchSmartPage("https://example.org/document");expect(result.text).toContain("Verified public source passage");expect(result.text.length).toBeLessThanOrEqual(20_000);
});
it("rejects pages beyond the bounded 2MB download limit",async()=>{
 const request=page(2_000_000);await expect(fetchSmartPage("https://example.org/document")).rejects.toThrow("source_size");expect(request.destroy).toHaveBeenCalled();
});
it("rejects private DNS before making a source request",async()=>{
 mocks.lookup.mockResolvedValue([{address:"127.0.0.1",family:4}]);await expect(fetchSmartPage("https://example.org/document")).rejects.toThrow("private_address");expect(mocks.request).not.toHaveBeenCalled();
});
