import{beforeEach,afterEach,it,expect,vi}from"vitest";
import{CITY_SOURCE_POLICY,citySourceInRelease}from"@newspoint/content/city-sources";
const mocks=vi.hoisted(()=>({read:vi.fn()}));vi.mock("node:fs/promises",()=>({readFile:mocks.read}));vi.mock("@newspoint/db/node",()=>({findRepoRoot:()=>process.cwd()}));
import{readCityCollectorHealth}from"./city-collector-health";
const report=()=>{const ids=Object.keys(CITY_SOURCE_POLICY).filter(citySourceInRelease);return{version:1,checkedAt:new Date().toISOString(),status:"ok",expectedSources:ids.length,healthySources:ids.length,sources:ids.map(id=>({id,status:"healthy"}))}};
beforeEach(()=>{vi.stubEnv("NODE_ENV","development");vi.stubEnv("CITY_GUIDE_STORAGE_DIR","");mocks.read.mockResolvedValue(JSON.stringify(report()))});afterEach(()=>vi.unstubAllEnvs());
it("recognizes a healthy current collector",async()=>{expect((await readCityCollectorHealth()).status).toBe("ok")});
it("does not pretend a stopped or mismatched collector is healthy",async()=>{mocks.read.mockResolvedValue(JSON.stringify({...report(),checkedAt:new Date(Date.now()-660000).toISOString()}));expect((await readCityCollectorHealth()).status).toBe("stopped");const wrong=report();wrong.sources[0]!.id='unknown';mocks.read.mockResolvedValue(JSON.stringify(wrong));expect((await readCityCollectorHealth()).status).toBe("unavailable")});
it("requires explicit production storage and keeps malformed timestamps safe",async()=>{vi.stubEnv("NODE_ENV","production");expect((await readCityCollectorHealth()).status).toBe("not-configured");vi.stubEnv("NODE_ENV","development");mocks.read.mockResolvedValue(JSON.stringify({...report(),checkedAt:'invalid'}));expect(await readCityCollectorHealth()).toEqual({status:"stopped",checkedAt:null})});
