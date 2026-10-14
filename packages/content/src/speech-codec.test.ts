import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { checkSpeechEncoder, compressSpeechParts } from "@newspoint/content/audio";
const run = promisify(execFile);
it.each(["opus", "aac"] as const)("encodes mono WAV as %s with real FFmpeg and preserves recording duration", async format => {
  const directory = await mkdtemp(path.join(tmpdir(), "np-codec-test-"));
  try {
    const samples = 24000 * 2;
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write("RIFF"); wav.writeUInt32LE(wav.length-8,4); wav.write("WAVEfmt ",8);
    wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
    wav.writeUInt32LE(24000,24); wav.writeUInt32LE(48000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
    wav.write("data",36); wav.writeUInt32LE(samples*2,40);
    for(let i=0;i<samples;i++) wav.writeInt16LE(Math.round(7000*Math.sin(2*Math.PI*440*i/24000)),44+i*2);
    await checkSpeechEncoder(format);
    const [encoded] = await compressSpeechParts([wav], format);
    expect(encoded!.length).toBeLessThan(wav.length/4);
    const output=path.join(directory,format === "opus" ? "speech.webm" : "speech.m4a"); await writeFile(output,encoded!);
    const probe=JSON.parse((await run(process.env.FFPROBE_PATH || "ffprobe",["-v","error","-show_entries","stream=codec_name,sample_rate,channels,bit_rate","-of","json",output],{windowsHide:true})).stdout);
    expect(probe.streams[0]).toMatchObject({codec_name:format,sample_rate:format === "opus" ? "48000" : "24000",channels:1});
    const decoded=await run(process.env.FFMPEG_PATH || "ffmpeg",["-v","error","-i",output,"-f","s16le","-acodec","pcm_s16le","-ar","24000","pipe:1"],{encoding:"buffer",windowsHide:true});
    expect(Math.abs(decoded.stdout.length-samples*2)).toBeLessThanOrEqual(1024*2);
  } finally { await rm(directory,{recursive:true,force:true}); }
},30_000);
