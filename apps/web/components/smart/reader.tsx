"use client";

import { useEffect, useRef, useState } from "react";
import { SMART_QUESTION_LIMIT, normalizeSmartQuestion, type SmartBootstrap, type SmartQuestion, type SmartSession, type SmartTurn } from "@newspoint/content/smart";
import "./smart.css";
import { currentCookieConsent, useCookieConsent } from "../cookie-consent-store";
import type { AnalyticsWindow } from "../../lib/cookie-consent-effects";

type Turn = SmartTurn & { nodeKey?: string | null };
type Session = Omit<SmartSession,"turns"> & {turns:Turn[]};
type Props = { articleId: string; initial?: SmartBootstrap; demo?: boolean; measurementId?:string|undefined };
const sourceLabels={current:"Тази статия",newspoint:"NewsPoint",official:"Официален източник",external:"Външен източник"};
function inlineAnswer(text:string){return text.split(/(\*\*[^*\n]+\*\*)/g).map((part,index)=>part.startsWith("**")&&part.endsWith("**")?<strong key={index}>{part.slice(2,-2)}</strong>:part);}
function SmartMark(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8"/><circle cx="12" cy="12" r="4"/></svg>}
async function smartFetch<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(path,{cache:"no-store",...init});
  const result=await response.json();
  if(!response.ok) throw Object.assign(new Error(typeof result.error==="string"?result.error:"Връзката е прекъсната. Опитайте отново."),{code:typeof result.code==="string"?result.code:undefined});
  return result as T;
}
export function SmartReader({articleId,initial,demo=false,measurementId}:Props){
  const consent=useCookieConsent().record?.statistics===true;
  const measuredTurns=useRef(new Set<string>());
  const impression=useRef(false);
  function track(action:string,extra:Record<string,string|number|boolean>={}){
    const analytics=window as AnalyticsWindow;
    if(demo||!measurementId||currentCookieConsent()?.statistics!==true||analytics.__npAnalyticsLoaded?.kind!=="ga4"||typeof analytics.gtag!=="function")return false;
    analytics.gtag("event",`np_smart_${action}`,{article_id:articleId,...extra,send_to:measurementId});return true;
  }
  const [bootstrap,setBootstrap]=useState<SmartBootstrap|null>(initial??null);
  const [session,setSession]=useState<Session|null>(null);
  const [activeId,setActiveId]=useState<string|null>(null);
  const [question,setQuestion]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [ready,setReady]=useState(Boolean(initial));
  const [feedback,setFeedback]=useState<Record<string,boolean>>({});
  const root=useRef<HTMLElement>(null);
  const request=useRef<{key:string;question:string;questionId?:string;parentKey?:string}|null>(null);
  const prefix=`/api/smart/article/${encodeURIComponent(articleId)}`;
  const used=session?.usedQuestions??0;
  const limit=used>=SMART_QUESTION_LIMIT;
  const pending=session?.turns.some(t=>t.status==="pending")??false;
  const active=activeId==="root"?undefined:session?.turns.find(t=>t.id===activeId)??session?.turns.filter(t=>t.status==="completed").at(-1);
  const answered=session?.turns.filter(t=>t.status==="completed")??[];
  const asked=new Set(answered.map(t=>normalizeSmartQuestion(t.question)));
  const choices=(active?.answer?.followUps??bootstrap?.questions??[]).filter(q=>!asked.has(normalizeSmartQuestion(q.text)));
  const busy=loading||pending;
  useEffect(()=>{
    if(!consent||impression.current||!root.current)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&track("impression")){impression.current=true;observer.disconnect();}},{threshold:.3});
    observer.observe(root.current);return()=>observer.disconnect();
  },[consent,articleId,measurementId]);
  useEffect(()=>{for(const turn of answered)if(!measuredTurns.current.has(turn.id)&&track("answer",{used_questions:used,cached:turn.cached})){measuredTurns.current.add(turn.id);}},[session,consent]);
  async function loadBootstrap(){
    if(demo)return;
    try{
      setError("");const result=await smartFetch<SmartBootstrap>(`${prefix}/bootstrap/`);setBootstrap(result);setReady(true);
      const restored=await smartFetch<Session|null>(`${prefix}/session/`);if(restored)setSession(restored);return true;
    }catch(e){setError((e as Error).message);setReady(true);return false;}
  }
  useEffect(()=>{
    if(demo||initial)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();void loadBootstrap();}},{rootMargin:"300px"});
    if(root.current)observer.observe(root.current);return()=>observer.disconnect();
    // article changes remount this component via its article key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[articleId,demo]);
  useEffect(()=>{
    if(!pending||!session||demo)return;
    const controller=new AbortController();
    const tick=async()=>{try{const result=await smartFetch<Session>(`/api/smart/session/${session.id}/`,{signal:controller.signal});setSession(result);
      const last=result.turns.at(-1);if(last?.status==="completed"){setActiveId(last.id);request.current=null;}if(last?.status==="failed"){setError("Проучването не завърши. Опитайте отново след малко.");request.current=null;}}
      catch(e){if(!controller.signal.aborted)setError((e as Error).message);}};
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void tick();},2500);void tick();
    return()=>{clearInterval(timer);controller.abort();};
  },[pending,session?.id,demo]);
  async function ask(choice?:SmartQuestion){
    const value=(choice?.text??question).trim();if(!value||busy||limit)return;
    if(demo){setError("Демонстрация на интерфейса. AI не е извикван и няма генериран отговор.");return;}
    setLoading(true);setError("");
    try{
      let current=session;if(!current){current=await smartFetch<Session>(`${prefix}/session/`,{method:"POST"});setSession(current);}
      if(current.usedQuestions>=5)return;
      const publicChoice=choice&&(!active||Boolean(active.nodeKey));
      if(!request.current||request.current.question!==value||request.current.questionId!==(publicChoice?choice?.id:undefined)||request.current.parentKey!==(publicChoice?active?.nodeKey??undefined:undefined))request.current={key:crypto.randomUUID(),question:value,...(publicChoice?{questionId:choice!.id}:{}),...(publicChoice&&active?.nodeKey?{parentKey:active.nodeKey}:{})};
      const result=await smartFetch<Session>(`${prefix}/ask/`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:current.id,requestKey:request.current.key,question:value,questionId:request.current.questionId,parentKey:request.current.parentKey})});
      setSession(result);setQuestion("");const last=result.turns.at(-1);if(last)setActiveId(last.id);
      track("question",{question_type:choice?(active?"follow_up":"suggested"):"custom"});
      if(last&&last.status!=="pending")request.current=null;
      if(last?.status==="failed")setError("Проучването не завърши. Можеш да опиташ отново.");
    }catch(e){setError((e as Error).message);if((e as {code?:string}).code==="question_changed"&&await loadBootstrap()){setActiveId("root");setError("Предложенията са обновени. Избери актуален въпрос.");}}finally{setLoading(false);}
  }
  async function rate(useful:boolean){
    if(!session||!active)return;
    try{await smartFetch(`/api/smart/session/${session.id}/feedback/`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({turnId:active.id,useful})});setFeedback(v=>({...v,[active.id]:useful}));}
    catch(e){setError((e as Error).message);}
  }
  async function clear(){
    if(!session)return;
    try{await smartFetch(`/api/smart/session/${session.id}/`,{method:"DELETE"});setSession(null);setActiveId(null);setError("Разговорът е изтрит. Лимитът остава до изтичане на сесията.");}
    catch(e){setError((e as Error).message);}
  }
  return <section ref={root} className="np-smart" aria-labelledby={`smart-title-${articleId}`}>
    <header className="np-smart-header"><span className="np-smart-mark"><SmartMark/></span><div><span className="np-smart-brand">По тази история</span><h2 id={`smart-title-${articleId}`}>Продължи новината с NewsPoint Smart</h2><p>Задай до 5 въпроса по тази тема</p></div>{used>0?<span className="np-smart-count" aria-label={`${used} от 5 въпроса`}>{used}<span>/ 5</span></span>:null}</header>
    {demo?<p className="np-smart-notice">Демонстрация на интерфейса. Без свързан AI.</p>:null}
    {bootstrap?.related&&!answered.length?<a className="np-smart-related" href={bootstrap.related.path} onClick={()=>track("related",{destination_article_id:bootstrap.related!.articleId})}><span className="np-smart-eyebrow">Продължението в NewsPoint</span><strong>{bootstrap.related.title}</strong><span>{bootstrap.related.reason}</span></a>:null}
    {!ready?<p className="np-smart-status" role="status">Подготвяме посоките по тази новина…</p>:null}
    {bootstrap?.status==="preparing"&&!answered.length?<div className="np-smart-status" role="status"><p>Подготвяме въпроси, които си струва да зададеш.</p><button type="button" onClick={()=>void loadBootstrap()}>Провери отново</button></div>:null}
    {bootstrap?.status==="unavailable"?<p className="np-smart-notice">{bootstrap.message??"Smart временно не е достъпен. Можеш да продължиш със статията."}</p>:null}
    {session?.updated?<p className="np-smart-notice">Статията е обновена. Предишните отговори са по версията към момента на въпроса.</p>:null}
    <p className="sr-only" role="status" aria-atomic="true">{active?.answer?`Отговорът на „${active.question}“ е готов. Източниците са след отговора.`:""}</p>
    {answered.length>(active?1:0)?<details className="np-smart-history"><summary>Предишни въпроси <span>{answered.length-(active?1:0)}</span></summary><ol>{answered.filter(t=>t.id!==active?.id).map(t=><li key={t.id}><button type="button" onClick={()=>setActiveId(t.id)}>{t.question}</button></li>)}</ol></details>:null}
    {active?.answer?<article className="np-smart-answer"><h3>{active.question}</h3>{Date.parse(active.answer.expiresAt)<=Date.now()?<p className="np-smart-notice">Запазен отговор от предишна проверка. Информацията може да е променена; виж датата и източниците по-долу.</p>:null}{active.answer.blocks.map((block,index)=><div className="np-smart-answer-block" key={index}><p>{inlineAnswer(block.text)}</p><span className="np-smart-inline-sources">{block.sourceIds.map(id=>{const s=active.answer!.sources.find(x=>x.id===id);return s?<a key={id} href={s.url} onClick={()=>track("source",{source_kind:s.kind})} target="_blank" rel="noopener noreferrer">{s.kind==="current"?"Тази статия":s.title}</a>:null;})}</span></div>)}
      {active.answer.sources.length?<details className="np-smart-sources"><summary>Източници и проверка</summary><ul>{active.answer.sources.map(s=><li key={s.id}><span>{sourceLabels[s.kind]}</span><a href={s.url} onClick={()=>track("source",{source_kind:s.kind})} target="_blank" rel="noopener noreferrer">{s.title}</a><small>{s.publishedAt?`Публикувано ${new Date(s.publishedAt).toLocaleDateString("bg-BG")}`:"Датата на публикуване не е установена"}</small></li>)}</ul><small>Проверено {new Date(active.answer.checkedAt).toLocaleString("bg-BG",{timeZone:"Europe/Sofia"})}</small></details>:null}
      <div className="np-smart-feedback"><span>Беше ли полезно?</span><button type="button" aria-pressed={feedback[active.id]===true} onClick={()=>void rate(true)}>Да</button><button type="button" aria-pressed={feedback[active.id]===false} onClick={()=>void rate(false)}>Не</button></div>
    </article>:active?.status==="completed"?<p className="np-smart-notice">Източниците за този отговор са обновени или вече не са публични.</p>:null}
    {busy?<p className="np-smart-status" role="status"><span className="np-smart-working" aria-hidden="true"/>Проучваме въпроса и проверяваме източниците… Можеш да се върнеш към статията.</p>:null}
    {!limit&&choices.length?<div className="np-smart-questions" aria-label={answered.length?"Продължи историята":"Избери какво искаш да разбереш"}>{choices.map(q=><button key={q.id} type="button" disabled={busy} onClick={()=>void ask(q)}><span>{q.text}</span><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 10h10m-4-4 4 4-4 4"/></svg></button>)}</div>:null}
    {used===3?<p className="np-smart-remaining">Остават ти 2 въпроса по тази новина.</p>:null}
    {limit?<div className="np-smart-finished"><strong>Използва петте въпроса по тази новина.</strong><p>Можеш да се върнеш към отговорите и техните източници.</p>{bootstrap?.related?<a href={bootstrap.related.path}>Прочети свързаната публикация</a>:null}</div>:<form className="np-smart-form" onSubmit={e=>{e.preventDefault();void ask();}}><label className="sr-only" htmlFor={`smart-question-${articleId}`}>Твой въпрос по тази новина</label><input id={`smart-question-${articleId}`} minLength={3} maxLength={600} placeholder="Какво още искаш да разбереш?" value={question} disabled={busy} onChange={e=>setQuestion(e.target.value)}/><button type="submit" disabled={busy||!question.trim()}>Попитай</button></form>}
    {error?<p className="np-smart-error" role="alert">{error}</p>:null}
    <footer className="np-smart-footer"><span>Отговори с AI и проверими източници. Възможни са неточности.</span>{session?<button type="button" disabled={busy} onClick={()=>void clear()}>Изтрий разговора</button>:null}</footer>
  </section>;
}
