/** Supervised, read-only Apache HTTPS/H1 capacity ramp. No CDN or browser claim. */
import http from 'node:http';
import https from 'node:https';
import {readFileSync,writeFileSync} from 'node:fs';
import {freemem,loadavg} from 'node:os';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';

export function guardReason(s,baselineMs=100){
 if(s.health.some(p=>!p.ok||p.ms>Math.max(1500,baselineMs*5)))return 'health-degraded';
 if(s.apache?.idle!=null&&s.apache.idle<20)return 'apache-reserve-low';
 if(s.freeGiB<8)return 'memory-reserve-low';
 if(s.generatorLagMs>100)return 'generator-limited';
 return null;
}
export function percentile(values,p){const a=[...values].sort((x,y)=>x-y);return a[Math.max(0,Math.ceil(a.length*p)-1)]??0;}

export async function run(){
 const execute=process.argv.includes('--execute');
 const stageValues=process.env.NP_CAPACITY_STAGES?.split(',').map(Number)??[10,25,50,75,100,150,200,300,400];
 if(!stageValues.length||stageValues.length>12||stageValues.some((v,i)=>!Number.isInteger(v)||v<1||v>2500||(i>0&&v<=stageValues[i-1])))throw Error('Invalid increasing bounded stages');
 const config={stages:stageValues,dwellMs:60000,rampPerSecond:5,protocol:'HTTPS/H1.1',scope:'direct Apache, uncached article plus sampled assets and one SSE per reader'};
 if(!execute){console.log(JSON.stringify({dryRun:true,...config}));return;}
 if(!process.env.NP_ORIGIN_CA||!process.env.NP_ARTICLE_PATH||!process.env.NP_REPORT_FILE||!process.env.NP_ORIGIN_ADDRESS)throw Error('Explicit origin address, CA, article and report file required');
 const originAddress=process.env.NP_ORIGIN_ADDRESS;
 if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(originAddress))throw Error('Explicit IPv4 origin required');
 const path=process.env.NP_ARTICLE_PATH;
 if(!/^\/[a-z0-9-]+\/$/.test(path))throw Error('Canonical existing article required');
 const ca=readFileSync(process.env.NP_ORIGIN_CA);
 const requests=new Set(),readers=new Map(),samples=[],stages=[];
 let stopping=false,stopReason=null,badGuards=0,badLoads=0,phase='baseline',baselineMs=100;
 const lag=monitorEventLoopDelay({resolution:20});lag.enable();
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 function stop(reason){if(stopping)return;stopping=true;stopReason=reason;for(const req of requests)req.destroy();console.log(JSON.stringify({event:'STOP',reason,at:new Date().toISOString()}));}
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>stop('operator-stop'));
 const hardTimer=setTimeout(()=>stop('time-budget'),15*60*1000);
 function get(route,{internal=false,host='newspoint.bg',limit=2*1024*1024}={}){
  return new Promise(resolve=>{
   const start=performance.now();let done=false,bytes=0,chunks=[];
   const finish=(ok,status,error)=>{if(done)return;done=true;clearTimeout(timer);requests.delete(req);req.destroy();resolve({ok,status,ms:Math.round(performance.now()-start),bytes,error,body:Buffer.concat(chunks).toString()});};
   const req=(internal?http:https).get({hostname:internal?'127.0.0.1':originAddress,port:internal?3100:443,path:route,agent:false,...(!internal?{ca,servername:'newspoint.bg',ALPNProtocols:['http/1.1']}:{}),headers:{Host:host,accept:'text/html','user-agent':'Mozilla/5.0 NewsPointCapacityProbe/1.0',cookie:'np-viewport=desktop'}},res=>{
    res.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit)finish(false,res.statusCode,'body-limit');else chunks.push(chunk);});
    res.on('end',()=>finish(res.statusCode===200,res.statusCode));res.on('error',()=>finish(false,res.statusCode,'response-error'));res.on('aborted',()=>finish(false,res.statusCode,'aborted'));
   });requests.add(req);const timer=setTimeout(()=>finish(false,0,'timeout'),5000);req.on('error',e=>finish(false,0,stopping?'stopped':e.code??'connection-error'));
  });
 }
 async function apache(){return new Promise(resolve=>{let text='';const req=http.get('http://127.0.0.1/server-status?auto',{agent:false,headers:{Host:'localhost'}},res=>{res.on('data',c=>{text+=c;if(text.length>32768)req.destroy();});res.on('end',()=>{const n=k=>Number(text.match(new RegExp('^'+k+':\\s*(\\S+)','m'))?.[1]);const idle=n('IdleWorkers'),busy=n('BusyWorkers');resolve(Number.isFinite(idle)&&Number.isFinite(busy)?{idle,busy,connections:n('ConnsTotal')}:null);});});req.setTimeout(2000,()=>req.destroy());req.on('error',()=>resolve(null));});}
 async function guard(){
  const [home,studio,a]=await Promise.all([get('/'),get('/admin/login/'),apache()]);
  const s={at:new Date().toISOString(),phase,readers:readers.size,health:[home,studio].map(({ok,status,ms})=>({ok,status,ms})),apache:a,freeGiB:Math.round(freemem()/1024**3),load1:loadavg()[0],generatorLagMs:Math.round(lag.max/1e6)};lag.reset();samples.push(s);console.log(JSON.stringify({event:'guard',...s}));
  const reason=guardReason(s,baselineMs);badGuards=reason?badGuards+1:0;
  if(!a){stop('monitor-unavailable');return;}
  if(badGuards>=2)stop(reason);
  return s;
 }
 async function openReader(id){
  return new Promise(resolve=>{
   const started=performance.now();let settled=false,healthy=false,lastChunk=Date.now(),chunks=0;
   const ready=(ok,error)=>{if(settled)return;settled=true;clearTimeout(openTimer);resolve({ok,error,ms:Math.round(performance.now()-started)});};
   const req=https.get({hostname:originAddress,port:443,path:'/api/live/',agent:false,ca,servername:'newspoint.bg',ALPNProtocols:['http/1.1'],headers:{Host:'newspoint.bg',accept:'text/event-stream','user-agent':'Mozilla/5.0 NewsPointCapacityProbe/1.0'}},res=>{
    if(res.statusCode!==200||!/^text\/event-stream/.test(res.headers['content-type']??'')){ready(false,'sse-response');req.destroy();return;}
    res.on('data',()=>{lastChunk=Date.now();chunks++;if(!healthy){healthy=true;readers.set(id,{req,get lastChunk(){return lastChunk},get chunks(){return chunks}});ready(true);}});
    res.on('end',()=>{if(!stopping&&healthy)stop('sse-ended');});res.on('error',()=>{if(!stopping&&healthy)stop('sse-response-error');});
   });requests.add(req);
   const openTimer=setTimeout(()=>{ready(false,'sse-open-timeout');req.destroy();},5000);
   req.on('error',()=>{ready(false,'sse-connection-error');if(!stopping&&healthy)stop('sse-connection-lost');});
   req.on('close',()=>{requests.delete(req);readers.delete(id);});
  });
 }
 let guardTimer,guardRunning=false;
 try{
  const article=await get(path);if(!article.ok||!article.body.includes('np-public-article'))throw Error('Real published article baseline failed');
  const resources=[...new Set([...article.body.matchAll(/(?:src|href)="((?:\/_next\/static\/[^"?]+\.(?:js|css)|\/media\/[^"?]+\.(?:webp|jpg|png)))"/g)].map(m=>m[1]))];
  const assets=[resources.find(p=>p.startsWith('/media/')),resources.find(p=>p.endsWith('.js')),resources.find(p=>p.endsWith('.css'))].filter(Boolean);
  for(let i=0;i<3;i++){const s=await guard();if(s)baselineMs=Math.max(baselineMs,...s.health.map(p=>p.ms));if(stopping)break;}
  if(stopping)return;
  guardTimer=setInterval(()=>{if(guardRunning||stopping)return;guardRunning=true;guard().catch(()=>stop('guard-error')).finally(()=>guardRunning=false);for(const reader of readers.values())if(Date.now()-reader.lastChunk>35000)stop('sse-heartbeat-missing');},3000);
  for(const count of config.stages){
   if(stopping)break;phase='ramp-'+count;const times=[];let launched=readers.size,failures=0;const tasks=[];
   while(launched<count&&!stopping){
    const id=++launched;
    tasks.push((async()=>{const doc=await get(path);if(!doc.ok||!doc.body.includes('np-public-article')){failures++;badLoads++;if(badLoads>=2)stop('document-failures');return;}times.push(doc.ms);badLoads=0;
     for(const asset of assets){if(stopping)return;const r=await get(asset,{limit:8*1024*1024});if(!r.ok){failures++;stop('asset-failure');return;}}
     if(!stopping){const r=await openReader(id);if(!r.ok){failures++;stop('sse-open-failed');}}
    })());await sleep(1000/config.rampPerSecond);
   }
   await Promise.all(tasks);if(stopping)break;phase='hold-'+count;const until=Date.now()+config.dwellMs;
   while(Date.now()<until&&!stopping)await sleep(250);
   const stage={count,active:readers.size,failures,documentP95Ms:percentile(times,.95),complete:!stopping,at:new Date().toISOString()};stages.push(stage);console.log(JSON.stringify({event:'stage',...stage}));
   if(stage.documentP95Ms>1500)stop('document-p95-degraded');
  }
 }catch(e){stop('test-error:'+e.message);}finally{
  clearInterval(guardTimer);clearTimeout(hardTimer);lag.disable();stop(stopReason??'configured-ceiling-reached');
  await sleep(2000);const recovery=await Promise.all([get('/'),get('/admin/login/')]);
  const report={at:new Date().toISOString(),config,stopReason,stages,samples,recovery:recovery.map(({ok,status,ms})=>({ok,status,ms})),highestCompleted:Math.max(0,...stages.filter(s=>s.complete&&!s.failures).map(s=>s.count)),limitations:['Same-host generator; does not measure CDN, WAN, browser JS or independent machines.','Sampled assets, one uncached document and one live connection per reader; not a universal user ceiling.','Stops at service/reserve threshold; not an absolute failure test.']};
  writeFileSync(process.env.NP_REPORT_FILE,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({event:'result',stopReason,highestCompleted:report.highestCompleted,recovery:report.recovery}));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await run();
