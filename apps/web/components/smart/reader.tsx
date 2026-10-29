"use client";

import { useEffect, useRef, useState } from "react";
import { SMART_QUESTION_LIMIT, smartReaderText, type SmartCard, type SmartBootstrap, type SmartSession, type SmartTurn } from "@newspoint/content/smart";
import "./smart.css";
import { smartChoices, type SmartChoice } from "./reader-flow";
import {ArticleImage} from "../ui";
import { currentCookieConsent, useCookieConsent } from "../cookie-consent-store";
import type { AnalyticsWindow } from "../../lib/cookie-consent-effects";

type Turn = SmartTurn & { nodeKey?: string | null };
type Session = Omit<SmartSession,"turns"> & {turns:Turn[]};
type Props = { articleId: string; initial?: SmartBootstrap; demo?: boolean; measurementId?:string|undefined };
function inlineAnswer(text:string){return smartReaderText(text).split(/(\*\*[^*\n]+\*\*)/g).map((part,index)=>part.startsWith("**")&&part.endsWith("**")?<strong key={index}>{part.slice(2,-2)}</strong>:part);}
function SmartNewsCards({cards}:{cards:SmartCard[]}){return <div className="np-smart-news-cards">{cards.map(card=><a className="np-smart-news-card" href={card.path} key={card.articleId}><div className="np-smart-news-copy"><span className="np-smart-eyebrow">Още по темата</span><strong>{card.title}</strong>{card.reason?<span>{card.reason}</span>:null}</div><ArticleImage media={card.hero??null} sizes="64px" className="np-smart-news-thumb"/></a>)}</div>;}
function SmartMark(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8"/><circle cx="12" cy="12" r="4"/></svg>}
async function smartFetch<T>(path:string,init?:RequestInit):Promise<T>{
  const controller=new AbortController();let timedOut=false;
  const abort=()=>controller.abort();init?.signal?.addEventListener("abort",abort,{once:true});
  if(init?.signal?.aborted)controller.abort();
  const timeout=setTimeout(()=>{timedOut=true;controller.abort();},20000);
  let response:Response;
  try{response=await fetch(path,{cache:"no-store",...init,signal:controller.signal});}
  catch(error){if(timedOut)throw new Error("Връзката се забави. Опитай отново след малко.");throw error;}
  finally{clearTimeout(timeout);init?.signal?.removeEventListener("abort",abort);}
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
  const [expanded,setExpanded]=useState(false);
  const [helpOpen,setHelpOpen]=useState(false);
  const [bootstrapRetry,setBootstrapRetry]=useState(0);
  const [preparationSlow,setPreparationSlow]=useState(false);
  const activateButton=useRef<HTMLButtonElement>(null);
  const panelHeading=useRef<HTMLHeadingElement>(null);
  const help=useRef<HTMLDivElement>(null);
  const helpButton=useRef<HTMLButtonElement>(null);
  const restored=useRef(false);
  const [bootstrap,setBootstrap]=useState<SmartBootstrap|null>(initial??null);
  const [session,setSession]=useState<Session|null>(null);
  const [submitting,setSubmitting]=useState("");
  const [question,setQuestion]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [ready,setReady]=useState(Boolean(initial));
  const root=useRef<HTMLElement>(null);
  const request=useRef<{key:string;question:string;questionId?:string;parentKey?:string}|null>(null);
  const prefix=`/api/smart/article/${encodeURIComponent(articleId)}`;
  const used=session?.usedQuestions??0;
  const limit=used>=SMART_QUESTION_LIMIT;
  const pending=session?.turns.some(t=>t.status==="pending")??false;
  const answered=session?.turns.filter(t=>t.status==="completed")??[];
  const choices=smartChoices(bootstrap?.questions??[],session?.turns??[],submitting);
  const latest=answered.at(-1);
  const busy=loading||pending;
  useEffect(()=>{
    if(!consent||impression.current||!root.current)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&track("impression")){impression.current=true;observer.disconnect();}},{threshold:.3});
    observer.observe(root.current);return()=>observer.disconnect();
  },[consent,articleId,measurementId]);
  useEffect(()=>{for(const turn of answered)if(!measuredTurns.current.has(turn.id)&&track("answer",{used_questions:used,cached:turn.cached})){measuredTurns.current.add(turn.id);}},[session,consent]);
  useEffect(()=>{
    if(demo||initial)return;
    const controller=new AbortController();
    const observer=new IntersectionObserver(entries=>{if(!entries.some(entry=>entry.isIntersecting))return;observer.disconnect();
      void smartFetch<SmartBootstrap|null>(`${prefix}/bootstrap/?peek=1`,{signal:controller.signal}).then(cached=>{if(!controller.signal.aborted&&cached?.status==="ready"){setBootstrap(cached);setReady(true);}}).catch(()=>{});
    },{rootMargin:"800px"});
    if(root.current)observer.observe(root.current);return()=>{observer.disconnect();controller.abort();};
    // Read cached public suggestions only. This route never queues paid preparation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[articleId,demo]);
  async function loadBootstrap(signal?:AbortSignal,retry=false){
    if(demo)return;
    try{
      setError("");const result=await smartFetch<SmartBootstrap>(`${prefix}/bootstrap/${retry?"?retry=1":""}`,{...(signal?{signal}:{})});
      if(signal?.aborted)return false;
      setBootstrap(result);setReady(true);
      if(!restored.current){const previous=await smartFetch<Session|null>(`${prefix}/session/`,{...(signal?{signal}:{})});if(!signal?.aborted){if(previous)setSession(previous);restored.current=true;}}
      return result.status;
    }catch(e){if(!signal?.aborted){setError((e as Error).message);setReady(true);}return false;}
  }
  useEffect(()=>{
    if(!expanded||demo||initial)return;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    const started=Date.now();let first=true;setPreparationSlow(false);if(bootstrap?.status!=="ready"){setBootstrap(null);setReady(false);}
    const tick=async()=>{
      const status=await loadBootstrap(controller.signal,first);first=false;
      if(controller.signal.aborted)return;
      if(status==="preparing"){
        if(Date.now()-started>=90000){setPreparationSlow(true);return;}
        timer=setTimeout(()=>void tick(),3000);
      }
    };
    void tick();return()=>{controller.abort();if(timer)clearTimeout(timer);};
    // Each activation/retry owns one sequential, cancellable polling loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[expanded,bootstrapRetry,articleId,demo]);
  useEffect(()=>{
    if(!helpOpen)return;
    const dismiss=(event:PointerEvent)=>{if(!help.current?.contains(event.target as Node))setHelpOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setHelpOpen(false);helpButton.current?.focus();}};
    document.addEventListener("pointerdown",dismiss);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",dismiss);document.removeEventListener("keydown",escape);};
  },[helpOpen]);
  useEffect(()=>{
    if(!expanded||!pending||!session||demo)return;
    const controller=new AbortController();let polling=false;
    const tick=async()=>{if(polling||controller.signal.aborted)return;polling=true;try{const result=await smartFetch<Session>(`/api/smart/session/${session.id}/`,{signal:controller.signal});if(controller.signal.aborted)return;setSession(result);
      const last=result.turns.at(-1);if(last?.status==="completed"){request.current=null;}if(last?.status==="failed"){setError("Проучването не завърши. Опитайте отново след малко.");request.current=null;}}
      catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{polling=false;}};
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void tick();},1000);void tick();
    return()=>{clearInterval(timer);controller.abort();};
  },[expanded,pending,session?.id,demo]);
  async function ask(choice?:SmartChoice){
    const value=(choice?.text??question).trim();if(!value||busy||limit)return;
    if(demo){setError("Това е преглед на интерфейса, без свързана обработка.");return;}
    setLoading(true);setSubmitting(value);setError("");
    try{
      let current=session;if(!current){current=await smartFetch<Session>(`${prefix}/session/`,{method:"POST"});setSession(current);}
      if(current.usedQuestions>=5)return;
      const publicChoice=choice?.public;
      if(!request.current||request.current.question!==value||request.current.questionId!==(publicChoice?choice?.id:undefined)||request.current.parentKey!==(publicChoice?choice?.parentKey??undefined:undefined))request.current={key:crypto.randomUUID(),question:value,...(publicChoice?{questionId:choice!.id}:{}),...(publicChoice&&choice?.parentKey?{parentKey:choice!.parentKey}:{})};
      const result=await smartFetch<Session>(`${prefix}/ask/`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:current.id,requestKey:request.current.key,question:value,questionId:request.current.questionId,parentKey:request.current.parentKey})});
      setSession(result);setQuestion("");const last=result.turns.at(-1);
      track("question",{question_type:choice?(choice.parentKey?"follow_up":"suggested"):"custom"});
      if(last&&last.status!=="pending")request.current=null;
      if(last?.status==="failed")setError("Проучването не завърши. Можеш да опиташ отново.");
    }catch(e){setError((e as Error).message);if((e as {code?:string}).code==="question_changed"&&await loadBootstrap()){setError("Предложенията са обновени. Избери актуален въпрос.");}}finally{setLoading(false);setSubmitting("");}
  }
  return <section ref={root} className={`np-smart${expanded?" np-smart-expanded":""}`} aria-labelledby={`smart-title-${articleId}`}>
    <div className="np-smart-topline"><span className="np-smart-identity"><span className="np-smart-mark"><SmartMark/></span><span>NewsPoint <strong>Smart</strong></span></span>
      <div className="np-smart-help" ref={help}><button ref={helpButton} className="np-smart-help-trigger" type="button" aria-expanded={helpOpen} aria-controls={`smart-help-${articleId}`} onClick={()=>setHelpOpen(v=>!v)}>Какво е NewsPoint Smart?<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 9v5m0-8v1"/></svg></button>
      {helpOpen?<div className="np-smart-help-bubble" id={`smart-help-${articleId}`} role="region" aria-label="За NewsPoint Smart"><strong>Новината не свършва с последния ред.</strong><p>NewsPoint Smart ти помага да разбереш повече за тази история. Избери предложен въпрос или задай свой. Системата разглежда темата в контекста на статията, свързаните ни публикации и допълнителна информация.</p><p>Получаваш допълнителен контекст и нови посоки за продължение. Можеш да зададеш до 5 въпроса по новината. Системата не гарантира 100% достоверност. При липсваща или противоречива информация посочва неяснотите.</p><button type="button" onClick={()=>{setHelpOpen(false);helpButton.current?.focus();}}>Разбрах</button></div>:null}</div>
    </div>
    <header className="np-smart-header"><div><h2 ref={panelHeading} tabIndex={-1} id={`smart-title-${articleId}`}>{expanded?"Какво още искаш да разбереш?":"Виж отвъд новината."}</h2><p>{expanded?"Въпрос по въпрос — по-дълбоко в историята.":"Повече контекст. Важните въпроси. По-ясната картина."}</p></div>{expanded&&used>0?<span className="np-smart-count" aria-label={`${used} от 5 въпроса`}>{used}<span>/ 5</span></span>:null}</header>
    {!expanded?<button ref={activateButton} className="np-smart-activate" type="button" aria-expanded={false} aria-controls={`smart-content-${articleId}`} onClick={()=>{setExpanded(true);requestAnimationFrame(()=>panelHeading.current?.focus({preventScroll:true}));track("activate");}}><SmartMark/><span>Използвай NewsPoint Smart</span><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button>:null}
    {expanded?<div className="np-smart-content" id={`smart-content-${articleId}`}>
    {demo?<p className="np-smart-notice">Преглед на интерфейса с тестови данни.</p>:null}
    {bootstrap?.related&&!answered.length?<SmartNewsCards cards={[bootstrap.related]}/>:null}
    {(!ready||bootstrap?.status==="preparing")&&!answered.length&&!error?<div className="np-smart-preparing" role="status" aria-live="polite"><span className={`np-smart-working${preparationSlow?" np-smart-paused":""}`} aria-hidden="true"/><div><strong>{preparationSlow?"Подготовката отнема повече време.":"Намираме трите важни въпроса."}</strong><p>{preparationSlow?"Можеш да опиташ отново или да зададеш свой въпрос.":"Моля, изчакай. Свързваме фактите и подбираме най-полезните посоки."}</p></div>{preparationSlow?<button type="button" onClick={()=>setBootstrapRetry(v=>v+1)}>Опитай отново</button>:null}</div>:null}
    {bootstrap?.status==="unavailable"?<div className="np-smart-notice" role="status"><p>{bootstrap.message??"Въпросите не се заредиха. Опитай отново."}</p><button className="np-smart-retry" type="button" onClick={()=>setBootstrapRetry(v=>v+1)}>Зареди трите въпроса</button></div>:null}
    {session?.updated?<p className="np-smart-notice">Статията е обновена. Предишните отговори са по версията към момента на въпроса.</p>:null}
    <p className="sr-only" role="status" aria-atomic="true">{latest?.answer?`Отговорът на „${latest.question}“ е готов. Можеш да продължиш с нов въпрос.`:""}</p>
    <ol className="np-smart-feed" aria-label="Твоят разговор по новината">
      {(session?.turns??[]).map((turn,index)=><li className="np-smart-turn" key={turn.id}>
        <div className="np-smart-reader-question"><span className="np-smart-turn-label">Твоят въпрос <span>{index+1}</span></span><h3>{turn.question}</h3></div>
        <article className="np-smart-answer" aria-label={`Отговор на: ${turn.question}`}>
          <div className="np-smart-answer-label"><SmartMark/><span>NewsPoint Smart</span></div>
          {turn.status==="pending"?<p className="np-smart-status" role="status"><span className="np-smart-working" aria-hidden="true"/>Проучваме въпроса и проверяваме фактите…</p>:turn.answer?<>
            {Date.parse(turn.answer.expiresAt)<=Date.now()?<p className="np-smart-notice">Запазен отговор от предишна проверка. Информацията може да е променена.</p>:null}
            {turn.answer.blocks.map((block,i)=><div className="np-smart-answer-block" key={i}><p>{inlineAnswer(block.text)}</p></div>)}
            {turn.cards?.length?<SmartNewsCards cards={turn.cards}/>:null}
          </>:<p className="np-smart-notice">{turn.status==="failed"?"Проучването не завърши. Можеш да зададеш въпроса отново.":"Този отговор вече не е достъпен след обновяването на публикациите."}</p>}
        </article>
      </li>)}
      {submitting&&!session?.turns.some(t=>t.status==="pending"&&t.question===submitting)?<li className="np-smart-turn"><div className="np-smart-reader-question"><span className="np-smart-turn-label">Твоят въпрос</span><h3>{submitting}</h3></div><p className="np-smart-status" role="status"><span className="np-smart-working" aria-hidden="true"/>Изпращаме въпроса…</p></li>:null}
    </ol>
    <div className="np-smart-next">
    {!limit&&choices.length?<><p className="np-smart-choices-label">{answered.length?"Продължи историята":"Избери посока"}</p><div className="np-smart-questions" aria-label={answered.length?"Продължи историята":"Избери какво искаш да разбереш"}>{choices.map(q=><button key={`${q.parentKey??"root"}:${q.id}`} type="button" disabled={busy} onClick={()=>void ask(q)}><span>{q.text}</span><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 10h10m-4-4 4 4-4 4"/></svg></button>)}</div></>:null}
    {used===3?<p className="np-smart-remaining">Остават ти 2 въпроса по тази новина.</p>:null}
    {limit?<div className="np-smart-finished"><strong>Използва петте въпроса по тази новина.</strong><p>Всички отговори остават видими в разговора.</p>{bootstrap?.related&&!answered.some(turn=>turn.cards?.some(card=>card.articleId===bootstrap.related!.articleId))?<SmartNewsCards cards={[bootstrap.related]}/>:null}</div>:<form className="np-smart-form" onSubmit={e=>{e.preventDefault();void ask();}}><label htmlFor={`smart-question-${articleId}`}>Или задай свой въпрос</label><div className="np-smart-input-wrap"><input id={`smart-question-${articleId}`} minLength={3} maxLength={600} placeholder="Попитай нещо по тази история…" value={question} disabled={busy} onChange={e=>setQuestion(e.target.value)}/><button type="submit" disabled={busy||question.trim().length<3}>Попитай<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 15V5m-4 4 4-4 4 4"/></svg></button></div></form>}
    </div>
    {error?<div className="np-smart-error" role="alert"><p>{error}</p>{!bootstrap||bootstrap.status!=="ready"?<button type="button" onClick={()=>setBootstrapRetry(v=>v+1)}>Опитай отново</button>:null}</div>:null}
    <button className="np-smart-collapse" type="button" aria-expanded={true} aria-controls={`smart-content-${articleId}`} onClick={()=>{setExpanded(false);requestAnimationFrame(()=>activateButton.current?.focus());}}>Свий панела</button>
    </div>:null}
  </section>;
}
