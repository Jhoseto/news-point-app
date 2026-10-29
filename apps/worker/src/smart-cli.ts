import {createScriptDb} from "@newspoint/db/node";
import {processSmartTick,startSmartWorker} from "./smart-worker";
// Dedicated local runner: does not start publishing, social, push or other AI modules.
const {db,close}=createScriptDb("dev",3);
if(process.argv.includes("--once")){
  try{console.log(JSON.stringify({processed:await processSmartTick(db)}));}finally{await close();}
}else{
  const stop=startSmartWorker(db,message=>console.log(message));
  for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,()=>{stop();void close().finally(()=>process.exit(0));});
}
