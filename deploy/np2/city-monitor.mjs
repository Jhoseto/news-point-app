import { readFile,writeFile,rename,mkdir } from "node:fs/promises";
import { resolve,isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

export function assessCollector(health,cycle={},now=Date.now()) {
  const started=Number(cycle.started)*1000,finished=Number(cycle.finished)*1000;
  if(Number.isFinite(started)&&started>0&&started<=now&&(!Number.isFinite(finished)||finished<started)&&now-started<21*60000) return {status:"collecting",problems:[]};
  if(!health||health.version!==1||!Array.isArray(health.sources)||!Number.isInteger(health.expectedSources)||health.expectedSources<1||health.sources.length!==health.expectedSources||new Set(health.sources.map(s=>s?.id)).size!==health.expectedSources||!health.sources.every(s=>/^[a-z0-9-]{1,150}$/.test(s?.id)&&["healthy","failed","missing","stale","overdue"].includes(s?.status))) return {status:"unavailable",problems:["invalid-health"]};
  const age=now-Date.parse(health.checkedAt);
  if(!Number.isFinite(age)||age<0||age>10*60000)return{status:"stopped",problems:["heartbeat-expired"]};
  const problems=health.sources.filter(s=>s.status!=="healthy").map(s=>`${s.id}:${s.status}`).sort();
  if(health.healthySources!==health.expectedSources-problems.length||health.status!==(problems.length?"degraded":"ok"))return{status:"unavailable",problems:["inconsistent-health"]};
  return{status:problems.length?"degraded":"ok",problems};
}
export function notificationDecision(current,previous) {
  if(current.status==="collecting")return null;
  const signature=createHash("sha256").update(JSON.stringify(current)).digest("hex");
  if(previous?.signature===signature)return null;
  if(current.status==="ok"&&!previous?.alerting)return null;
  return{signature,alerting:current.status!=="ok"};
}
const email=value=>typeof value==="string"&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)&&value.length<=254;
export async function submitMail({to,from,subject,text},sendmail="/usr/sbin/sendmail"){
  if(!email(to)||!email(from)||/[\r\n]/.test(subject))throw new Error("Invalid city alert mail configuration");
  const body=`From: NewsPoint City <${from}>\r\nTo: ${to}\r\nSubject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\nAuto-Submitted: auto-generated\r\n\r\n${Buffer.from(text).toString("base64").match(/.{1,76}/g)?.join("\r\n")}\r\n`;
  return new Promise((done,reject)=>{
    const child=spawn(sendmail,["-i","-t","-f",from],{stdio:["pipe","ignore","ignore"]});
    let settled=false;
    const timer=setTimeout(()=>{if(settled)return;settled=true;child.kill("SIGTERM");done("unknown")},20000);
    child.on("error",()=>{if(settled)return;settled=true;clearTimeout(timer);reject(new Error("Mail transport unavailable"))});
    child.on("close",code=>{if(settled)return;settled=true;clearTimeout(timer);if(code===0)done("submitted");else reject(new Error("Mail transport rejected submission"))});
    child.stdin.on("error",()=>{});child.stdin.end(body);
  });
}
async function atomic(path,value){await writeFile(`${path}.tmp`,JSON.stringify(value)+"\n",{mode:0o600});await rename(`${path}.tmp`,path)}
async function json(path){try{return JSON.parse(await readFile(path,"utf8"))}catch{return null}}
async function epoch(path){try{return Number((await readFile(path,"utf8")).trim())}catch{return 0}}
export async function runMonitor(test=false){
  process.loadEnvFile("/home/np2/newspoint-app/.env.local");
  const dir=process.env.CITY_GUIDE_STORAGE_DIR,to=process.env.CITY_ALERT_EMAIL,from=process.env.CITY_ALERT_FROM;
  if(!dir||!isAbsolute(dir)||!email(to)||!email(from))throw new Error("City monitoring storage/mail not configured");
  await mkdir(dir,{recursive:true,mode:0o700});
  if(test){
    const submission=await submitMail({to,from,subject:"NewsPoint — тест на градския монитор",text:"Тестово известие за Моят Пловдив.\nПроверява се доставката на сигнали за спрял събирач, повреден източник и възстановяване.\nТова не е съобщение за действителен отказ.\n"+new Date().toISOString()});
    await atomic(resolve(dir,"monitor-test.json"),{at:new Date().toISOString(),submission});console.log(JSON.stringify({test:true,submission}));return;
  }
  const path=resolve(dir,"alert-state.json"),previous=await json(path);
  const current=assessCollector(await json(resolve(dir,"collector-health.json")),{started:await epoch(resolve(dir,"cycle.started")),finished:await epoch(resolve(dir,"cycle.finished"))});
  const decision=notificationDecision(current,previous);
  await atomic(resolve(dir,"monitor-last.json"),{checkedAt:new Date().toISOString(),...current});
  if(!decision)return;
  const subject=current.status==="ok"?"NewsPoint — градските справки са възстановени":"NewsPoint — проблем с градските справки";
  const text=`Моят Пловдив\nСъстояние: ${current.status}\nПроверка: ${new Date().toISOString()}\n${current.problems.join("\n")}\nПодробности: Studio → Моят Пловдив.\nНяма промяна по публичното публикуване.`;
  try{
    const submission=await submitMail({to,from,subject,text});
    // An uncertain submission is recorded, never blindly resent every five minutes.
    await atomic(path,{...decision,at:new Date().toISOString(),submission});
    if(submission!=="submitted")process.exitCode=1;
  }catch{
    await atomic(resolve(dir,"monitor-delivery-error.json"),{at:new Date().toISOString(),error:"mail-not-submitted"});throw new Error("City alert delivery failed");
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runMonitor(process.argv.includes("--test")).catch(error=>{console.error(error.message);process.exitCode=1});
