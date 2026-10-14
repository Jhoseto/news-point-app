import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { expect, it } from "vitest";
const exec=promisify(execFile);
const bash=process.platform==="win32"?"C:/Program Files/Git/bin/bash.exe":"bash";
const shellPath=(value:string)=>process.platform==="win32"?value.replace(/\\/g,"/").replace(/^([A-Za-z]):/,(_,drive:string)=>`/${drive.toLowerCase()}`):value;
it("preserves paid sources and compressed files across replacement without overwriting persistent recordings",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"np-preserve-test-"));
  try {
    const checkout=path.join(directory,"checkout"); const old=path.join(checkout,"apps","web",".tts-cache");
    const persistent=path.join(directory,"private-tts"); await mkdir(old,{recursive:true}); await mkdir(persistent);
    await writeFile(path.join(old,"a-v1.glite4.parts"),"paid source");
    await writeFile(path.join(old,"a-v1.glite4.opus-40-v1.parts"),"compressed");
    await writeFile(path.join(old,"b-v1.glite4.parts"),"old copy");
    await writeFile(path.join(persistent,"b-v1.glite4.parts"),"persistent wins");
    await writeFile(path.join(old,"temporary.tmp"),"incomplete");
    const script=shellPath(path.resolve("deploy/np2/preserve-tts-cache.sh"));
    await exec(bash,[script,shellPath(old),shellPath(persistent)],{windowsHide:true});
    await rm(checkout,{recursive:true,force:true});
    expect(await readFile(path.join(persistent,"a-v1.glite4.parts"),"utf8")).toBe("paid source");
    expect(await readFile(path.join(persistent,"a-v1.glite4.opus-40-v1.parts"),"utf8")).toBe("compressed");
    expect(await readFile(path.join(persistent,"b-v1.glite4.parts"),"utf8")).toBe("persistent wins");
    await expect(access(path.join(persistent,"temporary.tmp"))).rejects.toThrow();
    await exec(bash,[script,shellPath(old),shellPath(persistent)],{windowsHide:true});
    for(const file of ["remote-deploy.sh","start-newspoint.sh","preserve-tts-cache.sh"]) await exec(bash,["-n",shellPath(path.resolve("deploy/np2",file))],{windowsHide:true});
  } finally { await rm(directory,{recursive:true,force:true}); }
},30_000);
