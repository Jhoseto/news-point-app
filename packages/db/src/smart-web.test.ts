import {EventEmitter} from "node:events";
import {afterEach,beforeEach,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({lookup:vi.fn(),request:vi.fn()}));
vi.mock("node:dns/promises",()=>({lookup:mocks.lookup}));
vi.mock("node:https",()=>({request:mocks.request}));
import {fetchSmartPage} from "./smart-web";
beforeEach(()=>{vi.clearAllMocks();mocks.lookup.mockResolvedValue([{address:"8.8.8.8",family:4}]);});
afterEach(()=>{vi.useRealTimers();});
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
it("bounds a trickling response by one wall-clock deadline and never returns its partial body",async()=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
 let response:EventEmitter;
 const req=new EventEmitter() as any;req.destroy=vi.fn((error:Error)=>queueMicrotask(()=>req.emit("error",error)));
 req.end=()=>{response=new EventEmitter();Object.assign(response,{statusCode:200,headers:{"content-type":"text/html"}});mocks.request.mock.calls[0]![2](response);};mocks.request.mockReturnValue(req);
 const result=fetchSmartPage("https://example.org/trickle");const rejected=expect(result).rejects.toThrow("source_timeout");
 await vi.advanceTimersByTimeAsync(3000);response!.emit("data",Buffer.from("Verified source text. ".repeat(10)));
 await vi.advanceTimersByTimeAsync(3000);response!.emit("data",Buffer.from("Still arriving. ".repeat(10)));
 await vi.advanceTimersByTimeAsync(2000);await rejected;
 response!.emit("end");expect(req.destroy).toHaveBeenCalledWith(expect.objectContaining({message:"source_timeout"}));expect(vi.getTimerCount()).toBe(0);
});
it("shares the same deadline across DNS and redirects rather than granting each hop eight seconds",async()=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
 mocks.lookup.mockImplementation(async()=>{await new Promise(resolve=>setTimeout(resolve,3000));return [{address:"8.8.8.8",family:4}];});
 const requests:any[]=[];
 mocks.request.mockImplementation((_url,_options,callback)=>{
  const req=new EventEmitter() as any;req.destroy=vi.fn((error?:Error)=>{if(error)queueMicrotask(()=>req.emit("error",error));});requests.push(req);
  req.end=()=>setTimeout(()=>{const res=new EventEmitter() as any;res.statusCode=302;res.headers={location:"https://example.org/next"};callback(res);},3000);
  return req;
 });
 const result=fetchSmartPage("https://example.org/first");const rejected=expect(result).rejects.toThrow("source_timeout");
 await vi.advanceTimersByTimeAsync(8000);await rejected;
 expect(mocks.lookup).toHaveBeenCalledTimes(2);expect(mocks.request).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1000);expect(mocks.request).toHaveBeenCalledTimes(1);
 expect(requests[0].destroy).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it("cancels DNS waiting and cannot start a late request when that DNS call completes",async()=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
 let resolveDns!:(value:{address:string;family:number}[])=>void;
 mocks.lookup.mockReturnValue(new Promise(resolve=>{resolveDns=resolve;}));
 const controller=new AbortController();const remove=vi.spyOn(controller.signal,"removeEventListener");
 const result=fetchSmartPage("https://example.org/slow-dns",0,controller.signal);const rejected=expect(result).rejects.toThrow("source_aborted");
 controller.abort();await rejected;resolveDns([{address:"8.8.8.8",family:4}]);await Promise.resolve();await Promise.resolve();
 expect(mocks.request).not.toHaveBeenCalled();expect(remove).toHaveBeenCalledWith("abort",expect.any(Function));expect(vi.getTimerCount()).toBe(0);
});
it("aborts an active download and clears its deadline",async()=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
 const req=new EventEmitter() as any;req.end=vi.fn();req.destroy=vi.fn((error:Error)=>queueMicrotask(()=>req.emit("error",error)));mocks.request.mockReturnValue(req);
 const controller=new AbortController();const result=fetchSmartPage("https://example.org/download",0,controller.signal);const rejected=expect(result).rejects.toThrow("source_aborted");
 await vi.advanceTimersByTimeAsync(0);controller.abort();await rejected;
 expect(req.destroy).toHaveBeenCalledWith(expect.objectContaining({message:"source_aborted"}));expect(vi.getTimerCount()).toBe(0);
});
it("cleans up a successful page and refuses an already cancelled request without DNS",async()=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});page(100);
 const controller=new AbortController();const remove=vi.spyOn(controller.signal,"removeEventListener");
 expect((await fetchSmartPage("https://example.org/success",0,controller.signal)).text).toContain("Verified public source passage");
 expect(remove).toHaveBeenCalledWith("abort",expect.any(Function));expect(vi.getTimerCount()).toBe(0);
 mocks.lookup.mockClear();controller.abort();await expect(fetchSmartPage("https://example.org/no-request",0,controller.signal)).rejects.toThrow("source_aborted");expect(mocks.lookup).not.toHaveBeenCalled();
});
it("rechecks redirected DNS and refuses a private destination before a second request",async()=>{
 mocks.lookup.mockResolvedValueOnce([{address:"8.8.8.8",family:4}]).mockResolvedValueOnce([{address:"127.0.0.1",family:4}]);
 const req=new EventEmitter() as any;req.destroy=vi.fn();
 req.end=()=>queueMicrotask(()=>{mocks.request.mock.calls[0]![2]({statusCode:302,headers:{location:"https://example.org/internal"}});});mocks.request.mockReturnValue(req);
 await expect(fetchSmartPage("https://example.org/start")).rejects.toThrow("private_address");expect(mocks.request).toHaveBeenCalledTimes(1);
});
