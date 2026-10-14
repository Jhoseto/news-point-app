import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
vi.mock("@newspoint/content/disk",()=>({remoteDiskFromEnv:()=>null,openRemoteRange:vi.fn(),remoteFileSize:vi.fn()}));
import {podcastAudioResponse} from "./podcast-stream";
let directory:string;
beforeEach(async()=>{directory=await mkdtemp(path.join(tmpdir(),"np-podcast-stream-test-"));vi.stubEnv("MEDIA_ROOT",directory);await mkdir(path.join(directory,"podcasts/2026/10"),{recursive:true});await writeFile(path.join(directory,"podcasts/2026/10/abcd.m4a"),"0123456789");await writeFile(path.join(directory,"podcasts/2026/10/abcd.mp3"),"0123456789");});
afterEach(async()=>{vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});});
it.each(["mp3","m4a"])("serves %s byte ranges with codec MIME and exact bytes",async extension=>{
  const response=await podcastAudioResponse(`podcasts/2026/10/abcd.${extension}`,"bytes=2-5",null);
  expect(response.status).toBe(206);expect(response.headers.get("content-type")).toBe(extension==="m4a"?"audio/mp4":"audio/mpeg");expect(response.headers.get("content-range")).toBe("bytes 2-5/10");expect(await response.text()).toBe("2345");
});
it("rejects out-of-bounds ranges and unsafe/unsupported storage keys",async()=>{
  expect((await podcastAudioResponse("podcasts/2026/10/abcd.m4a","bytes=10-",null)).status).toBe(416);
  for(const key of ["podcasts/../secret.m4a","podcasts/2026/10/abcd.wav","news/2026/10/abcd.m4a"])expect((await podcastAudioResponse(key,null,null)).status).toBe(404);
});
