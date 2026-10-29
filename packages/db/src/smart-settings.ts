import {sql} from "drizzle-orm";
import {smartProviderSelectionSchema,type SmartProvider,type SmartProviderSettings} from "@newspoint/content/smart";
import {SmartError,type SmartDb} from "./smart";
import {smartConfig} from "./smart-provider";

function missingTable(error:unknown){
  for(let value=error,depth=0;value&&typeof value==="object"&&depth<4;depth++){
    if((value as {code?:string}).code==="42P01")return true;
    value=(value as {cause?:unknown}).cause;
  }
  return false;
}
async function readSelection(db:SmartDb){
  try{const row=(await db.execute(sql`select provider,openai_model,enabled,version,updated_at from smart_settings where id=true`))[0];if(!row)throw new SmartError("settings_missing",503,"Изборът за Smart не е наличен.");return row;}
  catch(error){if(missingTable(error))return null;throw error;}
}
/** One immutable provider snapshot per accepted job; a read failure never enables a fallback. */
export async function readSmartRuntimeConfig(db:SmartDb,env:Record<string,string|undefined>=process.env){
  const row=await readSelection(db);
  return smartConfig(row?{...env,SMART_PROVIDER:String(row.provider),SMART_MODEL:String(row.openai_model),SMART_ENABLED:row.enabled?"1":"0"}:env);
}
/** Public visibility has no credential or model metadata and does not start work. */
export async function readSmartEnabled(db:SmartDb,env:Record<string,string|undefined>=process.env){
  const row=await readSelection(db);return row?row.enabled===true:env.SMART_ENABLED==="1";
}
export async function readSmartProviderSettings(db:SmartDb,env:Record<string,string|undefined>=process.env):Promise<SmartProviderSettings>{
  const row=await readSelection(db);
  const provider=row?.provider??env.SMART_PROVIDER??"minimax";
  const openaiModel=row?.openai_model??"gpt-6.1-sol";
  if(openaiModel!=="gpt-6.1-sol"&&openaiModel!=="gpt-6-luna")throw new SmartError("model_config",503,"Невалиден OpenAI модел.");
  if(provider!=="minimax"&&provider!=="openai")throw new SmartError("provider_config",503,"Невалиден Smart доставчик.");
  const labels:Record<string,string>={"MiniMax-M3.1-Flash":"M3.1 Flash","MiniMax-M3":"M3","gpt-6.1-sol":"GPT-6.1 Sol","gpt-6.1-terra":"GPT-6.1 Terra","gpt-6-luna":"GPT-6 Luna"};
  const options=(["minimax","openai"] as SmartProvider[]).map(candidate=>{
    try{const config=smartConfig({...env,SMART_PROVIDER:candidate,SMART_MODEL:openaiModel});return {provider:candidate,label:candidate==="minimax"?"MiniMax":"OpenAI",model:config.model,modelLabel:labels[config.model]??config.model,available:Boolean(config.key)};}
    catch{return {provider:candidate,label:candidate==="minimax"?"MiniMax":"OpenAI",model:"",modelLabel:"Нужна е настройка",available:false};}
  });
  return {ready:Boolean(row),enabled:row?row.enabled===true:env.SMART_ENABLED==="1",provider,openaiModel,version:Number(row?.version??0),updatedAt:row?new Date(row.updated_at as string).toISOString():null,options};
}
export async function writeSmartProvider(db:SmartDb,input:unknown,actor:{id:string;role:string},env:Record<string,string|undefined>=process.env){
  if(!["admin","master_admin"].includes(actor.role))throw new SmartError("forbidden",403,"Нямате достъп до AI настройките.");
  const selection=smartProviderSelectionSchema.parse(input);
  const result=await db.transaction(async tx=>{
    const rows=await tx.execute(sql`select provider,openai_model,enabled,version from smart_settings where id=true for update`);
    const current=rows[0];if(!current)throw new SmartError("migration",503,"AI настройките още не са активирани.");
    if(Number(current.version)!==selection.version)throw new SmartError("conflict",409,"Изборът е променен от друг администратор. Заредете актуалните настройки.");
    const model=selection.openaiModel??String(current.openai_model);
    const enabled=selection.enabled??(current.enabled===true);
    // An administrator can always stop Smart, including after credentials were removed.
    if(enabled&&!smartConfig({...env,SMART_PROVIDER:selection.provider,SMART_MODEL:model}).key)throw new SmartError("key",422,"Избраният доставчик не е свързан. Добавете ключа в локалната конфигурация.");
    const changed=current.provider!==selection.provider||current.openai_model!==model||current.enabled!==enabled;
    const before={provider:String(current.provider),openaiModel:String(current.openai_model),enabled:current.enabled===true,version:Number(current.version)};
    if(changed)await tx.execute(sql`update smart_settings set provider=${selection.provider},openai_model=${model},enabled=${enabled},version=version+1,updated_by=${actor.id},updated_at=now() where id=true`);
    return {before,after:{provider:selection.provider,openaiModel:model,enabled,version:Number(current.version)+(changed?1:0)}};
  });
  return {...result,settings:await readSmartProviderSettings(db,env)};
}
