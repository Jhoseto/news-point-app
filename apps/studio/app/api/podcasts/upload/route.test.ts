import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({staff:vi.fn(),ready:vi.fn(),formats:vi.fn(),sizeReady:vi.fn(),existing:vi.fn(),insert:vi.fn(),update:vi.fn(),audio:vi.fn(),photo:vi.fn(),write:vi.fn(),remove:vi.fn(),refresh:vi.fn(),audit:vi.fn()}));
vi.mock("@/lib/session",()=>({staffFromRequest:mocks.staff}));
vi.mock("@/lib/auth",()=>({studioOrigins:()=>({trusted:["https://studio.test"]})}));
vi.mock("@/lib/media-disk",()=>({writeMediaFile:mocks.write,removeMediaFile:mocks.remove}));
vi.mock("@/lib/uploaded-photo",()=>({prepareUploadedPhoto:mocks.photo,UPLOADED_PHOTO_MAX_BYTES:25*1024*1024}));
vi.mock("@newspoint/content/audio",()=>({preparePodcastAudio:mocks.audio}));
vi.mock("@newspoint/db/podcasts",()=>({podcastsReady:mocks.ready,podcastAudioFormatsReady:mocks.formats,podcastAudioSizeReady:mocks.sizeReady,podcastForStaff:mocks.existing,insertPodcast:mocks.insert,updatePodcastFiles:mocks.update}));
vi.mock("../../../../lib/podcast-refresh",()=>({refreshPodcastPages:mocks.refresh}));
vi.mock("../../../../lib/audit-context",()=>({auditFacts:mocks.audit}));
import {POST} from "./route";
const id="618a7377-9e0e-4efa-b5b8-4c3688677236";
const old={id,title:"Fixture episode",summary:"Fixture summary",slug:"fixture-episode",categoryId:null,coverKey:"podcasts/2026/10/1111.webp",audioKey:"podcasts/2026/10/1111.mp3",bytes:100,durationSec:60,status:"published",publishedAt:new Date("2026-10-01T12:00:00Z")};
function request({editing=false,audio=true,cover=true,origin="https://studio.test"}={}){
  const form=new FormData(); form.set("title","Fixture episode");form.set("summary","Fixture summary");form.set("publish","0");
  if(editing)form.set("id",id);
  if(audio)form.set("audio",new File(["fixture source"],"fixture.wav",{type:"audio/wav"}));
  if(cover)form.set("cover",new File(["fixture photo"],"fixture.png",{type:"image/png"}));
  return new Request("https://studio.test/api/podcasts/upload/",{method:"POST",headers:{origin},body:form});
}
beforeEach(()=>{
  for(const mock of Object.values(mocks))mock.mockReset();
  mocks.staff.mockResolvedValue({id:"fixture-editor",role:"editor"});mocks.ready.mockResolvedValue(true);mocks.formats.mockResolvedValue(true);mocks.sizeReady.mockResolvedValue(true);mocks.existing.mockResolvedValue(old);
  mocks.audio.mockResolvedValue({buffer:Buffer.from("aac"),extension:"m4a",durationSec:60,originalBytes:14,optimized:true});mocks.photo.mockResolvedValue({buffer:Buffer.from("webp")});
  mocks.write.mockResolvedValue(undefined);mocks.remove.mockResolvedValue(undefined);mocks.refresh.mockResolvedValue(true);
  mocks.insert.mockImplementation(async input=>({...old,...input,id}));mocks.update.mockImplementation(async(_id,input)=>({...old,...input}));
});
it("stores exactly one optimized audio asset and reports actual stored size",async()=>{
  const response=await POST(request());expect(response.status).toBe(200);
  const data=await response.json();expect(data.episode.audioKey).toMatch(/\.m4a$/);expect(data.episode.bytes).toBe(3);
  expect(data.audioOptimization).toEqual({originalBytes:14,storedBytes:3,savedBytes:11});
  expect(mocks.write.mock.calls).toHaveLength(2);expect(mocks.write.mock.calls[1]![1]).toEqual(Buffer.from("aac"));
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({bytes:3,durationSec:60,status:"draft"}));
  expect(mocks.remove).not.toHaveBeenCalled();expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("updates an existing episode's audio while keeping its cover/status/publication date",async()=>{
  const response=await POST(request({editing:true,cover:false}));expect(response.status).toBe(200);
  const data=await response.json();expect(data.episode.id).toBe(id);expect(data.episode.coverKey).toBe(old.coverKey);expect(data.episode.status).toBe("published");expect(data.episode.publishedAt).toBe(old.publishedAt.toISOString());
  expect(mocks.update).toHaveBeenCalledWith(id,expect.objectContaining({audioKey:expect.stringMatching(/\.m4a$/),bytes:3}));
  expect(mocks.insert).not.toHaveBeenCalled();expect(mocks.write).toHaveBeenCalledTimes(1);expect(mocks.remove).not.toHaveBeenCalled();
});
it("keeps audio unchanged when only the cover is replaced",async()=>{
  const response=await POST(request({editing:true,audio:false}));expect(response.status).toBe(200);
  expect((await response.json()).episode.audioKey).toBe(old.audioKey);expect(mocks.audio).not.toHaveBeenCalled();expect(mocks.write).toHaveBeenCalledTimes(1);
});
it("requires migration 35 for M4A before any durable writes",async()=>{
  mocks.formats.mockResolvedValue(false);expect((await POST(request())).status).toBe(503);
  expect(mocks.write).not.toHaveBeenCalled();expect(mocks.insert).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();
});
it("continues accepting an already compact MP3 without migration 35",async()=>{
  mocks.audio.mockResolvedValue({buffer:Buffer.from("mp3"),extension:"mp3",durationSec:60,originalBytes:3,optimized:false});
  expect((await POST(request())).status).toBe(200);expect(mocks.formats).not.toHaveBeenCalled();
});
it("cleans only new files if the database write fails",async()=>{
  mocks.insert.mockRejectedValue(new Error("database unavailable"));expect((await POST(request())).status).toBe(503);
  expect(mocks.remove.mock.calls.map(call=>call[0])).toEqual(mocks.write.mock.calls.map(call=>call[0]));
});
it("keeps committed files when cache revalidation is unavailable",async()=>{
  mocks.refresh.mockRejectedValue(new Error("revalidate unavailable"));const response=await POST(request());expect(response.status).toBe(200);expect((await response.json()).refreshed).toBe(false);expect(mocks.remove).not.toHaveBeenCalled();
});
it("rejects foreign origins before reading files or invoking processing",async()=>{
  expect((await POST(request({origin:"https://elsewhere.test"}))).status).toBe(403);expect(mocks.audio).not.toHaveBeenCalled();expect(mocks.staff).not.toHaveBeenCalled();
});
it("requires an authorized editor",async()=>{
  mocks.staff.mockResolvedValue(null);expect((await POST(request())).status).toBe(401);
  mocks.staff.mockResolvedValue({id:"fixture-reader",role:"reader"});expect((await POST(request())).status).toBe(403);expect(mocks.audio).not.toHaveBeenCalled();
});
it("does not create a duplicate when an edited episode no longer exists",async()=>{
  mocks.existing.mockResolvedValue(null);expect((await POST(request({editing:true}))).status).toBe(404);expect(mocks.insert).not.toHaveBeenCalled();expect(mocks.audio).not.toHaveBeenCalled();
});
it("rejects incomplete new episodes",async()=>{
  expect((await POST(request({audio:false}))).status).toBe(400);expect((await POST(request({cover:false}))).status).toBe(400);expect(mocks.write).not.toHaveBeenCalled();
});
it("reports an interrupted multipart upload without creating media or an episode",async()=>{
  const input=request();vi.spyOn(input,"formData").mockRejectedValue(new TypeError("aborted"));
  const response=await POST(input);expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("upload_interrupted");
  expect(mocks.audio).not.toHaveBeenCalled();expect(mocks.write).not.toHaveBeenCalled();expect(mocks.insert).not.toHaveBeenCalled();
});
it("rejects an oversized aggregate body before reading it",async()=>{
  const input=request();input.headers.set("content-length",String(126*1024*1024));
  const read=vi.spyOn(input,"formData");const response=await POST(input);
  expect(response.status).toBe(413);expect((await response.json()).error.code).toBe("upload_too_large");
  expect(read).not.toHaveBeenCalled();expect(mocks.write).not.toHaveBeenCalled();
});
it("accepts a 100 MiB audio file and publishes only the optimized asset",async()=>{
  const input=request();const form=await input.formData();
  const audio=form.get("audio") as File;Object.defineProperty(audio,"size",{value:100*1024*1024});
  form.set("publish","1");vi.spyOn(input,"formData").mockResolvedValue(form);
  const response=await POST(input);expect(response.status).toBe(200);
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({status:"published",audioKey:expect.stringMatching(/\.m4a$/)}));
  expect(mocks.write).toHaveBeenCalledTimes(2);expect(mocks.write.mock.calls[1]![1]).toEqual(Buffer.from("aac"));
});
it("rejects audio above 100 MiB even without content-length",async()=>{
  const input=request();const form=await input.formData();
  const audio=form.get("audio") as File;Object.defineProperty(audio,"size",{value:100*1024*1024+1});
  vi.spyOn(input,"formData").mockResolvedValue(form);
  expect((await POST(input)).status).toBe(413);expect(mocks.audio).not.toHaveBeenCalled();expect(mocks.write).not.toHaveBeenCalled();
});
it("requires migration 36 before writing a delivery file over the old 80 MiB cap",async()=>{
  const buffer=Buffer.from("explicit mocked file size");Object.defineProperty(buffer,"length",{value:81*1024*1024});
  mocks.audio.mockResolvedValue({buffer,extension:"m4a",durationSec:60,originalBytes:100*1024*1024,optimized:true});
  mocks.sizeReady.mockResolvedValue(false);
  const response=await POST(request());expect(response.status).toBe(503);
  expect((await response.json()).error.message).toContain("36_podcast_audio_size.sql");
  expect(mocks.write).not.toHaveBeenCalled();expect(mocks.insert).not.toHaveBeenCalled();
});
