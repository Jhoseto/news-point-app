"use client";

import {useEffect,useRef,useState} from "react";
import type {SmartProvider,SmartProviderSettings} from "@newspoint/content/smart";
import {withBase} from "../lib/paths";
import "./ai-settings.css";

async function settingsRequest(init?:RequestInit){
  const response=await fetch(withBase("/api/ai-settings/"),{cache:"no-store",...init});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error?.message??"Настройките не се записаха. Опитайте отново.");
  return data as SmartProviderSettings;
}
export function AiSettingsDesk(){
  const [settings,setSettings]=useState<SmartProviderSettings|null>(null);
  const [saving,setSaving]=useState<SmartProvider|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const inFlight=useRef(false);
  async function load(signal?:AbortSignal){
    setError("");setMessage("");try{const result=await settingsRequest(signal?{signal}:undefined);if(!signal?.aborted)setSettings(result);}
    catch(caught){if(!signal?.aborted)setError((caught as Error).message);}
  }
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[]);
  async function choose(provider:SmartProvider){
    if(!settings?.ready||settings.provider===provider||inFlight.current)return;
    inFlight.current=true;setSaving(provider);setError("");setMessage("");
    try{
      const result=await settingsRequest({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider,version:settings.version})});
      setSettings(result);setMessage(`NewsPoint Smart вече използва ${result.provider==="minimax"?"MiniMax":"OpenAI"}.`);
    }catch(caught){setError((caught as Error).message);try{setSettings(await settingsRequest());}catch{/* Keep the last confirmed selection until a read succeeds. */}}
    finally{inFlight.current=false;setSaving(null);}
  }
  return <main className="np-ai-settings">
    <header className="np-ai-settings-heading"><h1>AI настройки</h1><p>Избери кой модел да използва NewsPoint Smart.</p></header>
    <section className="np-ai-settings-section" aria-labelledby="smart-provider-title">
      <div className="np-ai-settings-section-heading"><div><span className="np-ai-settings-eyebrow">Модел за отговорите</span><h2 id="smart-provider-title">NewsPoint Smart</h2></div>{settings?<span className="np-ai-settings-current">Активен: <strong>{settings.provider==="minimax"?"MiniMax":"OpenAI"}</strong></span>:null}</div>
      {!settings&&!error?<p className="np-ai-settings-loading" role="status">Зареждаме текущия избор…</p>:null}
      {settings?<><div className="np-ai-settings-options" role="group" aria-label="Избор на доставчик">{settings.options.map(option=>{
        const active=settings.provider===option.provider;
        // bc-audit-ignore: button-focus-ring-missing — ai-settings.css supplies a 2px :focus-visible outline; browser QA checks it.
        return <button className="np-ai-settings-option" key={option.provider} type="button" aria-pressed={active} disabled={saving!==null||!option.available||!settings.ready} onClick={()=>void choose(option.provider)}>
          <span className="np-ai-settings-option-top"><strong>{option.label}</strong><span className="np-ai-settings-choice" aria-hidden="true">{active?<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m5 10 3 3 7-7"/></svg>:null}</span></span>
          <span className="np-ai-settings-model">{option.modelLabel}</span>
          <span className="np-ai-settings-option-status">{saving===option.provider?"Записваме избора…":!option.available?"Не е свързан":active?"Избран модел":"Използвай този модел"}</span>
        </button>;
      })}</div><p className="np-ai-settings-hint">Изборът се записва веднага и важи за следващите въпроси.</p>{!settings.ready?<p className="np-ai-settings-error" role="alert">Настройките още не са активирани.</p>:null}</>:null}
      {message?<p className="np-ai-settings-message" role="status">{message}</p>:null}
      {error?<div className="np-ai-settings-error" role="alert"><p>{error}</p><button type="button" disabled={saving!==null} onClick={()=>void load()}>Зареди актуалния избор</button></div>:null}
    </section>
  </main>;
}
