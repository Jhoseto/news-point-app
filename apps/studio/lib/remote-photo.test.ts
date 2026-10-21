import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({lookup:vi.fn(),get:vi.fn(),responses:[] as {status?:number;type?:string;location?:string;parts?:string[];length?:number}[]}));
vi.mock("node:dns/promises",()=>({lookup:mocks.lookup}));
vi.mock("node:http",()=>({get:mocks.get}));vi.mock("node:https",()=>({get:mocks.get}));
import {downloadRemotePhoto,photoSourceUrl,publicPhotoAddress} from "./remote-photo";
beforeEach(()=>{
 vi.clearAllMocks();mocks.lookup.mockResolvedValue([{address:"93.184.216.34",family:4}]);mocks.responses=[];
 mocks.get.mockImplementation((_url,options,callback)=>{
  // Exercise the exact pinned lookup used by the socket.
  options.lookup("ignored",{all:true},(_error:unknown,addresses:unknown)=>expect(addresses).toEqual([{address:"93.184.216.34",family:4}]));
  const request=new EventEmitter();queueMicrotask(()=>{
   const spec=mocks.responses.shift()??{};
   const response=Object.assign(new EventEmitter(),{statusCode:spec.status??200,headers:{"content-type":spec.type??"image/png",...(spec.location?{location:spec.location}:{}),...(spec.length?{"content-length":String(spec.length)}:{})},destroy:vi.fn()});
   response.destroy.mockImplementation((error?:Error)=>{if(error)response.emit("error",error);});
   callback(response);if(response.destroy.mock.calls.length)return;
   for(const part of spec.parts??["photo"])response.emit("data",Buffer.from(part));response.emit("end");
  });return request;
 });
});
it("accepts only public addresses including IPv6 and blocks special ranges",()=>{
 for(const ip of ["127.0.0.1","10.1.2.3","172.16.0.1","192.168.1.1","169.254.169.254","100.100.100.200","0.0.0.0","224.0.0.1","198.18.0.1","192.0.2.1","::1","::ffff:8.8.8.8","fc00::1","fe80::1","2001:db8::1","2002:7f00:1::"])expect(publicPhotoAddress(ip),ip).toBe(false);
 expect(publicPhotoAddress("8.8.8.8")).toBe(true);expect(publicPhotoAddress("2606:4700:4700::1111")).toBe(true);
});
it("rejects credentials, non-HTTP schemes, IP literals and custom ports",()=>{
 for(const value of ["file:///etc/passwd","http://localhost/a","https://user:pass@example.org/a","https://example.org:8443/a","http://2130706433/a","http://0x7f000001/a","http://[::1]/a"])expect(()=>photoSourceUrl(value),value).toThrow();
});
it("pins a public DNS result and never sends cookies/auth",async()=>{
 expect((await downloadRemotePhoto("https://cdn.example.org/a.png",20)).bytes.toString()).toBe("photo");
 const options=mocks.get.mock.calls[0]![1];expect(options.agent).toBe(false);expect(options.headers.cookie).toBeUndefined();expect(options.headers.authorization).toBeUndefined();
});
it("rejects mixed public/private DNS before opening any socket",async()=>{
 mocks.lookup.mockResolvedValue([{address:"93.184.216.34",family:4},{address:"127.0.0.1",family:4}]);
 await expect(downloadRemotePhoto("https://cdn.example.org/a",20)).rejects.toThrow("Blocked");expect(mocks.get).not.toHaveBeenCalled();
});
it("checks redirect DNS again and blocks redirection to internal services",async()=>{
 mocks.responses=[{status:302,location:"https://internal.example.org/a"}];mocks.lookup.mockResolvedValueOnce([{address:"93.184.216.34",family:4}]).mockResolvedValueOnce([{address:"169.254.169.254",family:4}]);
 await expect(downloadRemotePhoto("https://cdn.example.org/a",20)).rejects.toThrow("Blocked");expect(mocks.get).toHaveBeenCalledTimes(1);
});
it("bounds redirects, declared/streamed bytes and response MIME",async()=>{
 mocks.responses=Array.from({length:4},()=>({status:302,location:"/again"}));await expect(downloadRemotePhoto("https://cdn.example.org/a",20)).rejects.toThrow("redirects");
 mocks.responses=[{length:21}];await expect(downloadRemotePhoto("https://cdn.example.org/a",20)).rejects.toThrow("Invalid");
 mocks.responses=[{parts:["123456","123456"]}];await expect(downloadRemotePhoto("https://cdn.example.org/a",10)).rejects.toThrow("large");
 mocks.responses=[{type:"text/html"}];await expect(downloadRemotePhoto("https://cdn.example.org/a",20)).rejects.toThrow("Invalid");
});
