import "server-only";
import {getDb,loadRootEnv} from "@newspoint/db";
import {readSmartEnabled} from "@newspoint/db/smart-settings";
const headers={"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff"};
export async function smartAvailability(){
  try{loadRootEnv();return Response.json({enabled:await readSmartEnabled(getDb())},{headers});}
  catch{return Response.json({enabled:false},{status:503,headers});}
}
