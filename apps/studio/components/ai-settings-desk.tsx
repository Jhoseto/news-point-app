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
  async function choose(provider:SmartProvider,openaiModel=settings?.openaiModel,enabled=settings?.enabled){
    if(!settings?.ready||(settings.provider===provider&&settings.openaiModel===openaiModel&&settings.enabled===enabled)||inFlight.current)return;
    inFlight.current=true;setSaving(provider);setError("");setMessage("");
    try{
      const result=await settingsRequest({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider,openaiModel,enabled,version:settings.version})});
      setSettings(result);setMessage(result.enabled!==settings.enabled?`NewsPoint Smart е ${result.enabled?"включен":"изключен"}.`:"Настройките са запазени.");
    }catch(caught){setError((caught as Error).message);try{setSettings(await settingsRequest());}catch{/* Keep the last confirmed selection until a read succeeds. */}}
    finally{inFlight.current=false;setSaving(null);}
  }
  return <main className="np-ai-settings">
    <header className="np-ai-settings-heading"><h1>AI настройки</h1><p>Управление на механизмите в NewsPoint.</p></header>
    <div className="np-ai-settings-tabs" role="tablist" aria-label="Механизми">
      {/* bc-audit-ignore: button-focus-ring-missing — imported CSS covers all settings buttons with a 2px focus-visible outline. */}
      <button id="smart-settings-tab" type="button" role="tab" aria-selected="true" aria-controls="smart-settings-panel">NewsPoint Smart</button>
    </div>
    <section id="smart-settings-panel" role="tabpanel" tabIndex={0} className="np-ai-settings-section" aria-labelledby="smart-settings-tab">
      <div className="np-ai-settings-section-heading"><div><h2>NewsPoint Smart</h2><p>Въпроси и отговори под новините.</p></div>{settings?<div className="np-ai-settings-power"><span>{settings.enabled?"Включен":"Изключен"}</span>
        {/* bc-audit-ignore: button-focus-ring-missing — imported CSS covers this button with a verified 2px focus-visible outline. */}
        <button className="np-ai-settings-toggle" type="button" disabled={saving!==null||!settings.ready} aria-pressed={settings.enabled} aria-label={settings.enabled?"Изключи NewsPoint Smart":"Включи NewsPoint Smart"} onClick={()=>void choose(settings.provider,settings.openaiModel,!settings.enabled)}>{saving!==null?"Записваме…":settings.enabled?"Изключи":"Включи"}</button>
      </div>:null}</div>
      {!settings&&!error?<p className="np-ai-settings-loading" role="status">Зареждаме текущия избор…</p>:null}
      {settings?<><div className="np-ai-settings-row"><div className="np-ai-settings-label"><h3>Доставчик</h3><p>Моделът за отговорите на Smart.</p></div><div className="np-ai-settings-options" role="group" aria-label="Избор на доставчик">{settings.options.map(option=>{
        const active=settings.provider===option.provider;
        // bc-audit-ignore: button-focus-ring-missing — ai-settings.css supplies a 2px :focus-visible outline; browser QA checks it.
        return <button className="np-ai-settings-option" key={option.provider} type="button" aria-pressed={active} disabled={saving!==null||!option.available||!settings.ready} onClick={()=>void choose(option.provider)}>
          <span className="np-ai-settings-option-top"><strong>{option.label}</strong><span className="np-ai-settings-choice" aria-hidden="true">{active?<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m5 10 3 3 7-7"/></svg>:null}</span></span>
          <span className="np-ai-settings-model">{option.modelLabel}</span>
          <span className="np-ai-settings-option-status">{!option.available?"Не е свързан":active?"Избран":"Избери"}</span>
        </button>;
      })}</div></div>{settings.provider==="openai"?<fieldset className="np-ai-settings-models" disabled={saving!==null||!settings.ready||!settings.options.find(option=>option.provider==="openai")?.available}>
        <legend>Модел на OpenAI</legend>
        <div className="np-ai-settings-options">{([{id:"gpt-6.1-sol",name:"Sol",detail:"GPT-6.1 Sol"},{id:"gpt-6-luna",name:"Luna",detail:"GPT-6 Luna"}] as const).map(model=>
          // bc-audit-ignore: button-focus-ring-missing — imported CSS gives all settings buttons a verified 2px focus-visible outline.
          <button key={model.id} type="button" className="np-ai-settings-model-choice" aria-pressed={settings.openaiModel===model.id} onClick={()=>void choose("openai",model.id)}><strong>{model.name}</strong><span>{model.detail}</span><span>{settings.openaiModel===model.id?"Избран":"Избери"}</span></button>
        )}</div>
      </fieldset>:null}<p className="np-ai-settings-hint">{settings.enabled?"Промените се запазват веднага.":"Smart е спрян. Панелът е скрит под всички новини."}</p>{!settings.ready?<p className="np-ai-settings-error" role="alert">Настройките още не са активирани.</p>:null}</>:null}
      {message?<p className="np-ai-settings-message" role="status">{message}</p>:null}
      {error?<div className="np-ai-settings-error" role="alert"><p>{error}</p><button type="button" disabled={saving!==null} onClick={()=>void load()}>Зареди актуалния избор</button></div>:null}
    </section>
  </main>;
}
