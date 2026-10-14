import {expect,it} from "vitest";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {preparePodcastAudio} from "./audio-processing";
const run=promisify(execFile);
it.each([1,2])("compresses a real %i-channel WAV while preserving channels and duration",async channels=>{
  const directory=await mkdtemp(path.join(tmpdir(),"np-podcast-test-"));
  try {
    const input=path.join(directory,"fixture.wav");await run(process.env.FFMPEG_PATH||"ffmpeg",["-v","error","-f","lavfi","-i","sine=frequency=440:sample_rate=48000","-t","3","-ac",String(channels),input],{windowsHide:true});
    const source=await readFile(input),audio=await preparePodcastAudio(source,"fixture.wav");
    expect(audio.extension).toBe("m4a");expect(audio.durationSec).toBe(3);expect(audio.buffer.length).toBeLessThan(source.length/4);
    const output=path.join(directory,"fixture.m4a");await writeFile(output,audio.buffer);
    const probe=JSON.parse((await run(process.env.FFPROBE_PATH||"ffprobe",["-v","error","-show_entries","stream=codec_name,channels,sample_rate","-of","json",output],{windowsHide:true})).stdout);
    expect(probe.streams[0]).toMatchObject({codec_name:"aac",channels,sample_rate:"48000"});
    expect(audio.buffer.indexOf(Buffer.from("moov"))).toBeLessThan(audio.buffer.indexOf(Buffer.from("mdat")));
  } finally {await rm(directory,{recursive:true,force:true});}
},30_000);
it("keeps compact MP3 audio without another lossy encoding",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"np-podcast-compact-test-"));
  try {
    const input=path.join(directory,"fixture.mp3");await run(process.env.FFMPEG_PATH||"ffmpeg",["-v","error","-f","lavfi","-i","sine=frequency=440:sample_rate=44100","-t","3","-c:a","libmp3lame","-b:a","64k",input],{windowsHide:true});
    const source=await readFile(input),audio=await preparePodcastAudio(source,"fixture.mp3");expect(audio.extension).toBe("mp3");expect(audio.buffer.length).toBeLessThanOrEqual(source.length);
    const output=path.join(directory,"stored.mp3");await writeFile(output,audio.buffer);
    const decode=async(file:string)=>(await run(process.env.FFMPEG_PATH||"ffmpeg",["-v","error","-i",file,"-f","s16le","pipe:1"],{windowsHide:true,encoding:"buffer",maxBuffer:1024*1024})).stdout;
    expect(await decode(output)).toEqual(await decode(input));
  } finally {await rm(directory,{recursive:true,force:true});}
},30_000);
it("rejects deceptive/empty/unbounded audio input",async()=>{
  await expect(preparePodcastAudio(Buffer.from("<html>not sound</html>"),"fixture.mp3")).rejects.toThrow();
  await expect(preparePodcastAudio(Buffer.from("fixture"),"playlist.m3u")).rejects.toThrow();
  await expect(preparePodcastAudio(Buffer.from("ffconcat version 1.0\nfile '/not-an-upload.wav'\n"),"fake.mp3")).rejects.toThrow();
  await expect(preparePodcastAudio(Buffer.alloc(0),"fixture.wav")).rejects.toThrow();
});
it("rejects a video disguised as M4A",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"np-podcast-video-test-"));
  try {
    const input=path.join(directory,"fixture.m4a");await run(process.env.FFMPEG_PATH||"ffmpeg",["-v","error","-f","lavfi","-i","color=black:size=16x16:rate=1","-f","lavfi","-i","sine=frequency=440:sample_rate=48000","-t","1","-c:v","libx264","-c:a","aac","-f","mp4",input],{windowsHide:true});
    await expect(preparePodcastAudio(await readFile(input),"fixture.m4a")).rejects.toThrow("валиден моно или стерео звуков файл");
  } finally {await rm(directory,{recursive:true,force:true});}
},30_000);
