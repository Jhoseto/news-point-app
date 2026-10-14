import {beforeEach,expect,it,vi} from "vitest";
import {aiPodcastSettings} from "@newspoint/content";
const mocks=vi.hoisted(()=>({staff:vi.fn(),limit:vi.fn(),transaction:vi.fn(),prepare:vi.fn(),write:vi.fn(),remove:vi.fn(),values:vi.fn()}));
vi.mock("@/lib/auth",()=>({studioOrigins:()=>({trusted:["https://studio.test"]})}));
vi.mock("@/lib/session",()=>({staffFromRequest:mocks.staff}));
vi.mock("@/lib/media-disk",()=>({writeMediaFile:mocks.write,removeMediaFile:mocks.remove}));
vi.mock("@newspoint/content/audio",()=>({preparePodcastAudio:mocks.prepare}));
vi.mock("../../../../../lib/audit-context",()=>({auditFacts:vi.fn(),auditEvidence:vi.fn()}));
vi.mock("@newspoint/db",async original=>({...await original<typeof import("@newspoint/db")>(),getDb:()=>({select:()=>({from:()=>({where:()=>({limit:mocks.limit})})}),transaction:mocks.transaction})}));
import {POST} from "./route";
const id="618a7377-9e0e-4efa-b5b8-4c3688677236";
const project={id,title:"Fixture music project",status:"review",episodeId:null,musicAssetId:null,settings:aiPodcastSettings.parse({articleIds:[id,"618a7377-9e0e-4efa-b5b8-4c3688677237","618a7377-9e0e-4efa-b5b8-4c3688677238"],minutes:5,style:"natural",introMode:"automatic",intro:"",direction:"",music:"none",categoryId:null})};
function request(name="fixture.wav",origin="https://studio.test"){
  const form=new FormData();form.set("projectId",id);form.set("music",new File([new Uint8Array(2048)],name,{type:"audio/wav"}));
  return new Request("https://studio.test/api/podcasts/ai/music/",{method:"POST",headers:{origin},body:form});
}
beforeEach(()=>{
  for(const mock of Object.values(mocks))mock.mockReset();
  mocks.staff.mockResolvedValue({id:"fixture-editor",role:"editor"});mocks.limit.mockResolvedValueOnce([project]).mockResolvedValue([]);
  mocks.prepare.mockResolvedValue({buffer:Buffer.from("aac"),extension:"m4a",durationSec:30,originalBytes:2048,optimized:true});
  mocks.write.mockResolvedValue(undefined);mocks.remove.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async action=>action({insert:()=>({values:(input:unknown)=>{mocks.values(input);return{returning:async()=>[{id}]};}}),update:()=>({set:()=>({where:async()=>undefined})})}));
});
it("stores one compressed music asset and its measured byte count",async()=>{
  expect((await POST(request())).status).toBe(201);expect(mocks.write).toHaveBeenCalledWith(expect.stringMatching(/\.m4a$/),Buffer.from("aac"));
  expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({metadata:expect.objectContaining({bytes:3,originalBytes:2048,durationSec:30})}));expect(mocks.remove).not.toHaveBeenCalled();
});
it("rejects a foreign origin and unsupported input before processing",async()=>{
  expect((await POST(request("fixture.wav","https://elsewhere.test"))).status).toBe(403);
  expect((await POST(request("playlist.m3u"))).status).toBe(400);expect(mocks.prepare).not.toHaveBeenCalled();
});
it("does not process music while another job is active",async()=>{
  mocks.limit.mockReset().mockResolvedValueOnce([project]).mockResolvedValueOnce([{id}]);expect((await POST(request())).status).toBe(409);expect(mocks.prepare).not.toHaveBeenCalled();
});
it("requires published episodes to be hidden before changing their music",async()=>{
  mocks.limit.mockReset().mockResolvedValueOnce([{...project,episodeId:id}]).mockResolvedValueOnce([]).mockResolvedValueOnce([{status:"published"}]);
  expect((await POST(request())).status).toBe(409);expect(mocks.prepare).not.toHaveBeenCalled();
});
it("rejects clips below ten seconds without storing them",async()=>{
  mocks.prepare.mockResolvedValue({buffer:Buffer.from("aac"),extension:"m4a",durationSec:9,originalBytes:2048});expect((await POST(request())).status).toBe(400);expect(mocks.write).not.toHaveBeenCalled();
});
it("removes only the new asset if the transaction fails",async()=>{
  mocks.transaction.mockRejectedValue(new Error("fixture transaction failure"));expect((await POST(request())).status).toBe(503);
  expect(mocks.remove).toHaveBeenCalledWith(mocks.write.mock.calls[0]![0]);
});
