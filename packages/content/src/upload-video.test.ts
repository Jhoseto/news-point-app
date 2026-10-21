import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), listing: "", listCode: 0 }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("node:fs/promises", () => ({ stat: vi.fn().mockResolvedValue({ size: 1234 }) }));
beforeEach(() => {
 vi.resetModules(); vi.clearAllMocks(); mocks.listCode=0; mocks.listing=" V....D libx264 H.264 encoder\n V....D libopenh264 H.264 encoder\n";
 mocks.spawn.mockImplementation((_binary: string, args: string[]) => {
  const child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),kill:vi.fn()});
  queueMicrotask(()=>{
   const listing=args.includes("-encoders");
   const value=listing?mocks.listing:args.includes("-show_entries")?JSON.stringify({format:{duration:"2"},streams:[{codec_type:"video",width:1280,height:720}]}):"";
   child.stdout.emit("data",Buffer.from(value));child.emit("close",listing?mocks.listCode:0);
  });return child;
 });
});
afterEach(()=>vi.unstubAllEnvs());
it("prefers libx264 and retains its quality settings when both software encoders exist", async()=>{
 const {optimizeVideo}=await import("./upload-video");await expect(optimizeVideo("in.mp4","out.mp4")).resolves.toMatchObject({width:1280,height:720,bytes:1234});
 const encode=mocks.spawn.mock.calls.find(([,args])=>args.includes("-i"))![1];expect(encode).toEqual(expect.arrayContaining(["libx264","-preset","fast","-crf","22","yuv420p","aac","+faststart"]));
});
it("uses OpenH264 on LGPL builds without unsupported x264-only flags", async()=>{
 mocks.listing=" V....D libopenh264 OpenH264 H.264 encoder\n V....D h264_nvenc hardware encoder\n";
 const {optimizeVideo}=await import("./upload-video");await optimizeVideo("in.mp4","out.mp4");
 const encode=mocks.spawn.mock.calls.find(([,args])=>args.includes("-i"))![1];
 expect(encode).toEqual(expect.arrayContaining(["libopenh264","-rc_mode","bitrate","-b:v","1800k","yuv420p","aac","+faststart"]));expect(encode).not.toContain("-crf");expect(encode).not.toContain("-preset");
});
it("rejects hardware-only availability before attempting conversion", async()=>{
 mocks.listing=" V....D h264_nvenc hardware encoder\n";const {optimizeVideo}=await import("./upload-video");
 await expect(optimizeVideo("in.mp4","out.mp4")).rejects.toThrow("Видеото временно");expect(mocks.spawn.mock.calls.some(([,args])=>args.includes("-i"))).toBe(false);
});
it("caches capabilities per binary and retries a failed capability query", async()=>{
 const {optimizeVideo}=await import("./upload-video");mocks.listCode=1;await expect(optimizeVideo("in.mp4","out.mp4")).rejects.toThrow("video processing failed");
 mocks.listCode=0;await optimizeVideo("in.mp4","out.mp4");await optimizeVideo("in.mp4","out.mp4");
 expect(mocks.spawn.mock.calls.filter(([,args])=>args.includes("-encoders"))).toHaveLength(2);
 vi.stubEnv("FFMPEG_PATH","/another/ffmpeg");await optimizeVideo("in.mp4","out.mp4");expect(mocks.spawn.mock.calls.filter(([,args])=>args.includes("-encoders"))).toHaveLength(3);
});
