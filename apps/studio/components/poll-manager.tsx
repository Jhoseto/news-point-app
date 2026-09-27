"use client";

import { useEffect, useRef, useState } from "react";
import { pollInput, type PollInput, type Poll, type PublicPoll } from "@newspoint/db/poll-types";
import { withBase } from "@/lib/paths";
import { callApi } from "@/lib/client-api";
import "./poll-manager.css";

type List = {items:(Poll & {realTotal:number})[];more:boolean};
type Details = {poll:Poll;counts:Record<string,number>;result:PublicPoll;votes:{id:string;optionId:string;createdAt:string}[];revisions:{id:string;actorName:string;reason:string;snapshot:Poll;createdAt:string}[];moreVotes:boolean;moreRevisions:boolean};
const statusNames={draft:"Чернова",open:"Отворена",closed:"Приключила",archived:"Архив"};
const date = (value:string) => new Intl.DateTimeFormat("bg-BG",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Sofia"}).format(new Date(value));
function optionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Compatibility fallback for older embedded browsers. IDs carry no authority.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 3) | 8).toString(16);
  });
}
function blank():PollInput { return {version:0,question:"",description:"",options:[{id:optionId(),label:""},{id:optionId(),label:""}],status:"draft",featured:false,startsAt:null,endsAt:null}; }
function inputFrom(p:Poll):PollInput { const {id,version,question,description,options,status,featured,startsAt,endsAt}=p;return {id,version,question,description,options,status,featured,startsAt,endsAt}; }
function localTime(value:string|null) { if(!value)return ""; const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); }
function iso(value:string) { return value ? new Date(value).toISOString() : null; }
export function PollManager({initial,canCorrect}:{initial:List;canCorrect:boolean}) {
  const [list,setList]=useState(initial); const [listPage,setListPage]=useState(0);
  const [draft,setDraft]=useState<PollInput|null>(null);const [saved,setSaved]=useState("");
  const [details,setDetails]=useState<Details|null>(null);const [tab,setTab]=useState<"edit"|"results"|"history">("edit");
  const [page,setPage]=useState(0);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState("");
  const [deltas,setDeltas]=useState<Record<string,number>>({});
  const currentRequest=useRef(0);
  const dirty=!!draft && JSON.stringify(draft)!==saved;
  const correctionsDirty=!!details && JSON.stringify(deltas)!==JSON.stringify(details.poll.adjustments);
  const unsaved=dirty || correctionsDirty;
  useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(unsaved)e.preventDefault();};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[unsaved]);
  async function read<T>(query:string):Promise<T> {const r=await fetch(withBase(`/api/polls/${query}`),{cache:"no-store"});const data=await r.json();if(!r.ok)throw new Error(data.error?.message || "Няма връзка.");return data;}
  function install(data:Details) {setDetails(data);const form=inputFrom(data.poll);setDraft(form);setSaved(JSON.stringify(form));setDeltas(data.poll.adjustments);}
  async function open(id:string,nextPage=0) {
    if(unsaved && !window.confirm("Има незаписани промени. Да ги отхвърля ли?"))return;
    const request=++currentRequest.current;setBusy(true);setNotice("");
    try {const data=await read<Details>(`?id=${id}&page=${nextPage}`);if(request===currentRequest.current){install(data);setPage(nextPage);}}
    catch(e){setNotice(e instanceof Error?e.message:"Неуспешно зареждане.");}finally{setBusy(false);}
  }
  async function refreshList(nextPage=listPage) {setList(await read<List>(`?page=${nextPage}`));setListPage(nextPage);}
  function create(copy=false) {
    if(unsaved&&!window.confirm("Да отхвърля ли незаписаните промени?"))return;
    const next=copy&&draft?{...draft,id:undefined,version:0,question:draft.question,options:draft.options.map(o=>({...o,id:optionId()})),status:"draft" as const,featured:false,startsAt:null,endsAt:null}:blank();
    currentRequest.current++;setDraft(next);setSaved(JSON.stringify(next));setDetails(null);setDeltas({});setPage(0);setTab("edit");setNotice("");
  }
  function patch(value:Partial<PollInput>) {setDraft(p=>p?{...p,...value}:p);}
  async function save(correction=false) {
    if(!draft || busy)return;
    if(!correction){const parsed=pollInput.safeParse(draft);if(!parsed.success){setNotice(parsed.error.issues.map(i=>i.message).join(" "));return;}}
    setBusy(true);setNotice("");
    try {
      const result=await callApi<{poll:Poll;refreshed:boolean}>("POST","/api/polls/",correction?{action:"correct",input:{id:draft.id,version:draft.version,deltas}}:{action:"save",input:draft});
      if(!result.ok){setNotice(result.error.message);return;}
      // Preserve the successful save even if the follow-up read fails.
      const form=inputFrom(result.data.poll);setDraft(form);setSaved(JSON.stringify(form));setDeltas(result.data.poll.adjustments);
      install(await read<Details>(`?id=${result.data.poll.id}`));setPage(0);await refreshList();
      setNotice(result.data.refreshed?"Промените са записани.":"Промените са записани. Началната страница ще ги получи при следващото обновяване до около минута.");
    } catch(e){setNotice(e instanceof Error?e.message:"Опитайте отново.");}finally{setBusy(false);}
  }
  const locked=details?Object.values(details.counts).some(n=>n>0):false;
  const realTotal=details?Object.values(details.counts).reduce((a,b)=>a+b,0):0;
  return <div className="studio-polls">
    <header className="sp-heading"><div><h1>Анкети</h1><p>Мнението на читателите, подредено на едно място.</p></div><button disabled={busy} className="sp-primary" onClick={()=>create()}>＋ Нова анкета</button></header>
    <p role="status" className="sp-notice">{notice}</p>
    <div className="sp-layout"><aside className="sp-list" aria-label="Списък с анкети">
      {!list.items.length&&<p className="sp-empty">Няма създадени анкети. Започнете с въпрос и поне два отговора.</p>}
      {list.items.map(p=><button disabled={busy} key={p.id} onClick={()=>void open(p.id)} aria-current={draft?.id===p.id?"true":undefined}><span className="sp-list-meta">{statusNames[p.status]} {p.featured&&"· На началната"}</span><strong>{p.question}</strong><small>{p.realTotal} реални гласа · {date(p.createdAt)}</small></button>)}
      <div className="sp-pagination"><button disabled={busy||listPage===0} onClick={()=>void refreshList(listPage-1).catch(e=>setNotice(e.message))}>←</button><span>Страница {listPage+1}</span><button disabled={busy||!list.more} onClick={()=>void refreshList(listPage+1).catch(e=>setNotice(e.message))}>→</button></div>
    </aside>
    <main className="sp-workspace">{!draft?<div className="sp-empty"><span className="sp-emblem">↗</span><h2>Дайте думата на читателите</h2><p>Създайте кратка анкета или изберете съществуваща, за да видите участието.</p><button className="sp-primary" onClick={()=>create()}>Създай анкета</button></div>:<>
      <div className="sp-toolbar"><div className="sp-tabs">{([['edit','Редакция'],['results','Резултати'],['history','История']] as const).map(([key,label])=><button key={key} disabled={busy||(key!=="edit"&&!details)} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</div><div className="sp-tools">{draft.id&&<button disabled={busy} onClick={()=>create(true)}>Дублирай</button>}{draft.id&&<button disabled={busy} onClick={()=>void open(draft.id!)}>Обнови</button>}</div></div>
      {tab==="edit"&&<form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy} className="sp-editor">
        <label className="sp-label">Въпрос <span>{draft.question.length}/220</span><textarea rows={2} value={draft.question} minLength={5} maxLength={220} required disabled={locked} onChange={e=>patch({question:e.target.value})} placeholder="Какво искате да попитате читателите?"/></label>
        <label className="sp-label">Кратко пояснение <span>по желание</span><input value={draft.description} maxLength={300} disabled={locked} onChange={e=>patch({description:e.target.value})}/></label>
        <div><div className="sp-row"><h2>Отговори</h2><span>2–6 възможности · един избор</span></div><div className="sp-answer-list">{draft.options.map((o,index)=><div key={o.id}><span>{String(index+1).padStart(2,"0")}</span><input aria-label={`Отговор ${index+1}`} required maxLength={120} disabled={locked} value={o.label} onChange={e=>patch({options:draft.options.map(x=>x.id===o.id?{...x,label:e.target.value}:x)})}/><button type="button" title="Премахни отговора" aria-label={`Премахни отговор ${index+1}`} disabled={locked||draft.options.length<=2} onClick={()=>patch({options:draft.options.filter(x=>x.id!==o.id)})}>×</button></div>)}</div><button type="button" className="sp-text-button" disabled={locked||draft.options.length>=6} onClick={()=>patch({options:[...draft.options,{id:optionId(),label:""}]})}>＋ Добави отговор</button></div>
        {locked&&<p className="sp-hint">Вече има гласове. Въпросът и отговорите са заключени, за да се запази смисълът на резултатите. За промяна използвайте „Дублирай“.</p>}
        <div className="sp-settings"><label className="sp-label">Състояние<select value={draft.status} onChange={e=>{const status=e.target.value as PollInput['status'];patch({status,featured:status==="draft"||status==="archived"?false:draft.featured});}}>{Object.entries(statusNames).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label><label className="sp-label">Начало<input type="datetime-local" value={localTime(draft.startsAt)} onChange={e=>patch({startsAt:iso(e.target.value)})}/></label><label className="sp-label">Край<input type="datetime-local" value={localTime(draft.endsAt)} onChange={e=>patch({endsAt:iso(e.target.value)})}/></label></div>
        <p className="sp-hint">Часовете са в часовата зона на устройството: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Празно начало = веднага; празен край = до ръчно приключване.</p>
        <label className="sp-toggle"><input type="checkbox" disabled={draft.status==="draft"||draft.status==="archived"} checked={draft.featured} onChange={e=>patch({featured:e.target.checked})}/><span><strong>Показвай на началната страница</strong><small>Между „Регион“ и „България“. Заменя текущата избрана анкета.</small></span></label>
        {draft.featured&&draft.startsAt&&Date.parse(draft.startsAt)>Date.now()&&<p className="sp-hint">Текущата анкета ще бъде заменена при записа. Новата ще се покаже след началния час; дотогава секцията ще е скрита.</p>}
        <div className="sp-footer"><span>{dirty?"Незапазени промени":draft.id?"Всички промени са запазени":"Нова чернова"}</span><button type="submit" className="sp-primary" disabled={busy}>{busy?"Записване…":"Запази анкетата"}</button></div>
      </fieldset></form>}
      {tab==="results"&&details&&<div className="sp-editor"><div className="sp-stats"><div><strong>{realTotal}</strong><span>Реални гласове</span></div><div><strong>{details.result.total}</strong><span>Показан резултат</span></div><div><strong>{details.result.open?"Отворена":"Затворена"}</strong><span>В момента</span></div></div>
        <div className="sp-table-wrap"><table><thead><tr><th>Отговор</th><th>Реални</th><th>Корекция ±</th><th>Показани</th></tr></thead><tbody>{details.poll.options.map(o=><tr key={o.id}><td>{o.label}</td><td>{details.counts[o.id]??0}</td><td>{canCorrect?<input aria-label={`Корекция за ${o.label}`} disabled={busy} type="number" step={1} min={-(details.counts[o.id]??0)} max={1000000} value={deltas[o.id]??0} onChange={e=>setDeltas({...deltas,[o.id]:Number(e.target.value)})}/>:details.poll.adjustments[o.id]??0}</td><td>{(details.counts[o.id]??0)+(deltas[o.id]??0)}</td></tr>)}</tbody></table></div>
        {canCorrect&&<div className="sp-correction"><p className="sp-hint">± е отклонението от реалния брой, не новият брой. Реалните гласове остават непроменени. Промяната се обозначава публично и автоматично се записва с вашето име, дата и точните стойности.</p><button disabled={busy||dirty||!correctionsDirty} onClick={()=>void save(true)}>Запиши корекциите</button></div>}
        <div className="sp-row"><h2>Регистър на реалните гласове</h2><span>Без имена и сурови IP адреси</span></div>
        {!details.votes.length?<p className="sp-hint">Все още няма гласове.</p>:<div className="sp-table-wrap"><table><thead><tr><th>№</th><th>Отговор</th><th>Получен на</th></tr></thead><tbody>{details.votes.map(v=><tr key={v.id}><td>{v.id}</td><td>{details.poll.options.find(o=>o.id===v.optionId)?.label}</td><td>{date(v.createdAt)}</td></tr>)}</tbody></table></div>}
      </div>}
      {tab==="history"&&details&&<div className="sp-editor"><p className="sp-hint">Всяко създаване, редакция и корекция има неизменим запис. Историята не се изтрива при архивиране.</p>{details.revisions.map(r=><details className="sp-revision" key={r.id}><summary><strong>{r.actorName}</strong><span>{r.reason}</span><small>{date(r.createdAt)}</small></summary><h3>{r.snapshot.question}</h3><p>{statusNames[r.snapshot.status]} · {r.snapshot.featured?"Избрана за началната":"Не е на началната"}</p>{r.snapshot.options.map(o=><p key={o.id}>{o.label} <strong>корекция {r.snapshot.adjustments[o.id]??0}</strong></p>)}</details>)}</div>}
      {tab!=="edit"&&details&&<div className="sp-pagination"><button disabled={busy||page===0} onClick={()=>void open(details.poll.id,page-1)}>← Предишни</button><span>Страница {page+1}</span><button disabled={busy||!(tab==="results"?details.moreVotes:details.moreRevisions)} onClick={()=>void open(details.poll.id,page+1)}>Следващи →</button></div>}
    </>}</main></div>
  </div>;
}
