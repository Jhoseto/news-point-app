import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {sql,type SQL} from "drizzle-orm";
import {beforeAll,beforeEach,afterAll,afterEach,it,expect,vi} from "vitest";
import {readSmartProviderSettings,readSmartRuntimeConfig,writeSmartProvider} from "./smart-settings";
import type {SmartDb} from "./smart";
import {processSmartTick} from "../../../apps/worker/src/smart-worker";
const env={SMART_ENABLED:"1",SMART_PROVIDER:"minimax",MINIMAX_API_KEY:"explicit-qa-minimax-secret",OPENAI_API_KEY:"explicit-qa-openai-secret"};
let pg:PGlite,db:SmartDb;
function adapt(raw:Pick<ReturnType<typeof drizzle>,"execute"|"transaction">):SmartDb{return {execute:async(q:SQL)=>(await raw.execute(q)).rows,transaction:(fn:any)=>raw.transaction(tx=>fn(adapt(tx)))} as SmartDb;}
beforeAll(async()=>{pg=new PGlite();db=adapt(drizzle(pg));await pg.exec("create table staff_users(id text primary key);insert into staff_users values('qa-admin'),('qa-master'),('qa-editor');");await pg.exec(readFileSync(new URL("../migrations/46_smart_settings.sql",import.meta.url),"utf8"));});
beforeEach(async()=>{await db.execute(sql`update smart_settings set provider='minimax',version=1,updated_by=null`);});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
afterAll(async()=>{await pg.close();});
it("returns only safe selector metadata and preserves the configured Sol model",async()=>{
 const settings=await readSmartProviderSettings(db,env);expect(settings).toMatchObject({ready:true,provider:"minimax",version:1});expect(settings.options).toEqual([expect.objectContaining({provider:"minimax",model:"MiniMax-M3.1-Flash",available:true}),expect.objectContaining({provider:"openai",model:"gpt-6.1-sol",available:true})]);
 expect(JSON.stringify(settings)).not.toContain(env.MINIMAX_API_KEY);expect(JSON.stringify(settings)).not.toContain(env.OPENAI_API_KEY);
});
it("switches the next runtime snapshot while leaving the current job snapshot unchanged, with no provider calls",async()=>{
 const network=vi.fn();vi.stubGlobal("fetch",network);
 const current=await readSmartRuntimeConfig(db,env);
 const changed=await writeSmartProvider(db,{provider:"openai",version:1},{id:"qa-admin",role:"admin"},env);expect(changed.after).toEqual({provider:"openai",version:2});
 const selected=await readSmartRuntimeConfig(db,env);expect(selected).toMatchObject({provider:"openai",key:env.OPENAI_API_KEY,model:"gpt-6.1-sol",preparationModel:"gpt-6-luna"});expect(current.provider).toBe("minimax");
 await writeSmartProvider(db,{provider:"minimax",version:2},{id:"qa-master",role:"master_admin"},env);expect((await readSmartRuntimeConfig(db,env)).key).toBe(env.MINIMAX_API_KEY);expect(network).not.toHaveBeenCalled();
});
it("rejects an editor and stale admin version before changing the provider",async()=>{
 await expect(writeSmartProvider(db,{provider:"openai",version:1},{id:"qa-editor",role:"editor"},env)).rejects.toMatchObject({status:403});
 await writeSmartProvider(db,{provider:"openai",version:1},{id:"qa-admin",role:"admin"},env);
 await expect(writeSmartProvider(db,{provider:"minimax",version:1},{id:"qa-master",role:"master_admin"},env)).rejects.toMatchObject({code:"conflict",status:409});expect((await readSmartProviderSettings(db,env)).provider).toBe("openai");
});
it("does not increment the version when selecting the already active provider",async()=>{
 const result=await writeSmartProvider(db,{provider:"minimax",version:1},{id:"qa-admin",role:"admin"},env);expect(result.settings.version).toBe(1);
});
it("refuses a missing key and never falls back to the other provider",async()=>{
 await expect(writeSmartProvider(db,{provider:"openai",version:1},{id:"qa-admin",role:"admin"},{...env,OPENAI_API_KEY:""})).rejects.toMatchObject({code:"key"});
 await writeSmartProvider(db,{provider:"openai",version:1},{id:"qa-admin",role:"admin"},env);
 const runtime=await readSmartRuntimeConfig(db,{...env,OPENAI_API_KEY:""});expect(runtime.provider).toBe("openai");expect(runtime.key).toBe("");
 vi.stubEnv("SMART_ENABLED","1");vi.stubEnv("MINIMAX_API_KEY",env.MINIMAX_API_KEY);vi.stubEnv("OPENAI_API_KEY","");const network=vi.fn();vi.stubGlobal("fetch",network);expect(await processSmartTick(db)).toBe(false);expect(network).not.toHaveBeenCalled();
});
it("does not mask database outages with an env provider fallback",async()=>{
 const broken={execute:async()=>{throw Error("Explicit QA connection failure");}} as unknown as SmartDb;
 await expect(readSmartRuntimeConfig(broken,env)).rejects.toThrow("connection failure");
});
it("supports an installation before migration but fails closed for a missing singleton",async()=>{
 const missing={execute:async()=>{throw {cause:{code:"42P01"}};}} as unknown as SmartDb;
 expect((await readSmartRuntimeConfig(missing,env)).provider).toBe("minimax");expect((await readSmartProviderSettings(missing,env)).ready).toBe(false);
 await db.execute(sql`delete from smart_settings`);try{await expect(readSmartRuntimeConfig(db,env)).rejects.toMatchObject({code:"settings_missing"});}finally{await db.execute(sql`insert into smart_settings(id,provider) values(true,'minimax')`);}
});
