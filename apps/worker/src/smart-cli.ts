import {createScriptDb} from "@newspoint/db/node";
import {processSmartTick,startSmartWorker} from "./smart-worker";
// Dedicated local runner: does not start publishing, social, push or other AI modules.
const {db,close}=createScriptDb("dev",3);
if(process.argv.includes("--once")){
  try{console.log(JSON.stringify({processed:await processSmartTick(db)}));}finally{await close();}
}else{
  const stop=startSmartWorker(db,message=>console.log(message));
  let stopping:Promise<void>|null=null;
  const shutdown=()=>stopping??=(async()=>{await stop();await close();})();
  for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,()=>{void shutdown().then(()=>process.exit(0),()=>process.exit(1));});
}
