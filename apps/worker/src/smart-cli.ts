import {createScriptDb} from "@newspoint/db/node";
import {startSmartWorker} from "./smart-worker";
// Dedicated local runner: does not start publishing, social, push or other AI modules.
const {db,close}=createScriptDb("dev",3);
const stop=startSmartWorker(db,message=>console.log(message));
for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,()=>{stop();void close().finally(()=>process.exit(0));});
