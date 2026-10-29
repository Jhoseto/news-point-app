import { describe, expect, it } from "vitest";
import { publicSmartAddress, smartWebUrl } from "./smart-web";
import { smartConfig } from "./smart-provider";
import { parseOpenAiUsage } from "./ai-usage";
describe("Smart trust boundaries",()=>{
 it.each(["127.0.0.1","169.254.169.254","10.0.0.1","172.16.0.1","192.168.1.1","100.64.0.1","::1","::ffff:127.0.0.1","fe80::1","fc00::1","2001:db8::1"])("rejects private or reserved address %s",ip=>expect(publicSmartAddress(ip)).toBe(false));
 it.each(["http://example.org","https://user:password@example.org","https://example.org:8080/","https://metadata.internal","file:///etc/passwd"])("rejects unsafe research source %s",url=>expect(()=>smartWebUrl(url)).toThrow());
 it("accepts a public HTTPS source",()=>expect(smartWebUrl("https://www.plovdiv.bg/test#quote").href).toBe("https://www.plovdiv.bg/test"));
 it.each(["2001::1","2001:0000:1234::1","2001:0db8::1","2002:7f00:1::","3fff::1"])("rejects normalized IPv6 reserved or transition address %s",ip=>expect(publicSmartAddress(ip)).toBe(false));
 it.each(["8.8.8.8","2001:4860:4860::8888"])("accepts a native public address %s",ip=>expect(publicSmartAddress(ip)).toBe(true));
 it("rejects Astra even if it is configured explicitly",()=>expect(()=>smartConfig({SMART_MODEL:"gpt-6-astra"})).toThrow());
 it("records tokens and tool calls without adding reasoning twice",()=>expect(parseOpenAiUsage({usage:{input_tokens:100,output_tokens:60,input_tokens_details:{cached_tokens:20},output_tokens_details:{reasoning_tokens:40}},output:[{type:"web_search_call",status:"completed"}]})).toEqual({input:100,output:60,cachedInput:20,cacheWrite:0,reasoning:40,searches:1}));
});
