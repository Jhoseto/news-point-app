"use client";

import { useRef, useState } from "react";
import questions from "../data/questions.bg.json";
import { requestJSON } from "./editorial-api.mjs";
import NewEvidence from "./NewEvidence";

const questionById = new Map(questions.map(item => [item.id,item]));
const statusNames = {
  pending:"Очаква рецензии",approved:"Одобрено",rejected:"Отхвърлено",disputed:"Спорно",
  published:"Публикувано",superseded:"Заменено",withdrawn:"Оттеглено",
  new:"Нов",open:"Отворен",resolved:"Разрешен",declined:"Отхвърлен"
};
const dateFormat = new Intl.DateTimeFormat("bg-BG",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Sofia"});
function when(stamp) {
  if (!stamp) return "";
  const date = new Date(stamp);
  return Number.isNaN(date.getTime()) ? stamp : dateFormat.format(date);
}
const send = (action,body) => requestJSON("/api/admin/"+action,{body});
const packageKind = "compass-editorial-proposals-v1";
const chosenOption = row => questionById.get(row.questionId)?.options.find(option => option.id === row.optionId)?.label ?? "Недостатъчно основание за конкретна опция";

function SourceDetails({record,catalog,document}) {
  if (!record) return null;
  const source = document ?? catalog.sources.find(item=>item.id===record.sourceId);
  const subject = catalog.entities.find(item=>item.id===record.entityId);
  return <div className="rs-evidence"><article><small>{record.id} · {subject?.label}</small><strong>{record.claim}</strong><p>{record.locator}</p><p>{record.scoreReason}</p>
    {source && <a className="rs-link" target="_blank" rel="noreferrer" href={source.url}>{source.title} ↗</a>}</article></div>;
}

export function Intake({workspace,catalog,working,run}) {
  const [mode,setMode]=useState("existing");
  const [evidenceId,setEvidenceId] = useState(catalog.evidence[0]?.id ?? "");
  const row = catalog.evidence.find(item=>item.id===evidenceId);
  const [questionId,setQuestionId] = useState(row?.questionIds[0] ?? null);
  const [optionId,setOptionId] = useState("");
  const [reason,setReason] = useState("");
  const [preview,setPreview] = useState(null);
  const fileInput = useRef(null);
  const subjectName = id => catalog.entities.find(entity=>entity.id===id)?.label;
  const options = questionById.get(questionId)?.options ?? [];
  const makePackage = proposals => ({format:packageKind,releaseId:workspace.currentReleaseId,questionVersion:catalog.release.questionVersion,proposals});
  function previewPacket(input) {
    return run(async () => {
      const packet = await input();
      const result = await send("import",{mode:"preview",package:packet});
      setPreview({packet,result});
    },null,false);
  }
  function single(event) {
    event.preventDefault();
    previewPacket(() => makePackage([{evidenceId,questionId,optionId:optionId||null,reason:reason.trim()}]));
  }
  function loadFile(event) {
    const file = event.target.files?.[0];
    event.target.value="";
    if (!file) return;
    previewPacket(async () => {
      if (file.size>512*1024) throw new Error("Файлът надхвърля 512 KB.");
      try { return JSON.parse(await file.text()); }
      catch { throw new Error("Файлът не съдържа валиден JSON."); }
    });
  }
  function commit() {
    run(async () => {
      await send("import",{mode:"commit",package:preview.packet,token:preview.result.token});
      setPreview(null); setReason(""); setMode("existing");
    },"Предложенията са записани и са достъпни за независима рецензия.");
  }
  function downloadPackage() {
    const blob = new Blob([JSON.stringify(preview.packet,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href=url;link.download="compass-editorial-proposals.json";
    document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <>
    {preview && <section className="rs-box"><h2>Проверен пакет</h2><p>Сървърът провери {preview.result.count} предложения спрямо въпросника и версията на източниците. Прегледай ги преди запис.</p>
    <div className="rs-importlist">{preview.packet.proposals.map((p,index)=><article className="rs-proposal" key={index}><code>{p.evidenceId} · {p.questionId ?? "без свързан въпрос"}</code><strong>{chosenOption(p)}</strong><p>{p.reason}</p></article>)}</div>
    <div className="rs-row"><button className="rs-action rs-primary" disabled={working} onClick={commit}>Запиши за рецензия</button><button className="rs-action" onClick={downloadPackage}>Изтегли JSON</button><button className="rs-action" disabled={working} onClick={()=>setPreview(null)}>Върни се</button></div>
  </section>}
    <div hidden={Boolean(preview)}>
    <section className="rs-box"><h2>Ново предложение</h2>
      <div className="rs-chips"><button type="button" aria-pressed={mode==="existing"} disabled={working} onClick={()=>setMode("existing")}>От регистъра</button><button type="button" aria-pressed={mode==="new"} disabled={working} onClick={()=>setMode("new")}>Ново доказателство</button></div>
      {mode==="new" ? <NewEvidence catalog={catalog} working={working} onPreview={({proposal,...records})=>previewPacket(()=>({...makePackage([proposal]),...records}))}/> : <form onSubmit={single}><fieldset className="rs-controls" disabled={working || !row}>
        <label className="rs-field">Доказателствен запис<select value={evidenceId} onChange={e=>{
          const next=catalog.evidence.find(record=>record.id===e.target.value);
          setEvidenceId(next.id);setQuestionId(next.questionIds[0]??null);setOptionId("");setReason("");
        }}>{catalog.evidence.map(record=><option value={record.id} key={record.id}>{record.id} · {subjectName(record.entityId)} · {record.claim}</option>)}</select></label>
        <SourceDetails record={row} catalog={catalog}/>
        {row?.questionIds.length>0 ? <label className="rs-field">Свързан въпрос<select value={questionId} onChange={e=>{setQuestionId(e.target.value);setOptionId("");}}>{row.questionIds.map(id=><option key={id} value={id}>{id} · {questionById.get(id)?.prompt}</option>)}</select></label> : <p>За този запис няма пряко свързан въпрос.</p>}
        <label className="rs-field">Предложена позиция<select value={optionId} onChange={e=>setOptionId(e.target.value)}><option value="">Недостатъчно основание за определена опция</option>{options.map(o=><option key={o.id} value={o.id}>{o.id} · {o.label}</option>)}</select></label>
        <label className="rs-field">Обосновка<textarea required maxLength={2500} rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Посочи конкретния пасаж и как той подкрепя предложението." /></label>
        <button className="rs-action rs-primary" disabled={!reason.trim()}>Провери предложението</button>
      </fieldset></form>}
    </section>
    <section className="rs-box"><h2>Импорт на предложения</h2><p>Зареди изнесен JSON пакет за текущата версия. Новите документи и доказателствени записи се подават в масивите <code>sources</code> и <code>evidence</code>. Всяко предложение се свързва чрез <code>evidenceId</code>.</p>
      <button className="rs-action" disabled={working} onClick={()=>fileInput.current.click()}>Избери JSON файл</button><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={loadFile}/>
    </section>
    </div>
  </>;
}

function ReviewForm({proposal,catalog,session,working,run}) {
  const [reason,setReason]=useState("");
  const [decision,setDecision]=useState("approve");
  const [sourceChecked,setSourceChecked]=useState(false);
  const [adjudicate,setAdjudicate]=useState(false);
  const record=proposal.evidence ?? catalog.evidence.find(item=>item.id===proposal.evidenceId);
  const reviews=proposal.reviews??[];
  const author=proposal.author===session.userId;
  const alreadyReviewed=reviews.some(r=>r.actor===session.userId);
  const eligible=!proposal.stale && !author && !alreadyReviewed && ["pending","disputed"].includes(proposal.status);
  function submit(event) {
    event.preventDefault();
    run(async ()=>{
      await send("review",{proposalId:proposal.id,decision,reason:reason.trim(),sourceChecked,adjudicate});
      setReason("");setSourceChecked(false);setAdjudicate(false);
    },"Рецензията е записана.");
  }
  return <div className="rs-queuebody">
    <p>{questionById.get(proposal.questionId)?.prompt ?? "Запис без свързан въпрос"}</p>
    <strong>{chosenOption(proposal)}</strong><p>{proposal.reason}</p>
    <SourceDetails record={record} catalog={catalog} document={proposal.source}/>
    <dl className="rs-meta"><div><dt>Автор</dt><dd>{proposal.author}</dd></div><div><dt>Създадено</dt><dd>{when(proposal.createdAt)}</dd></div></dl>
    {reviews.length>0 && <div><h3>Записани рецензии</h3>{reviews.map(r=><article className="rs-proposal" key={r.id??r.actor}><code>{r.actor} · {when(r.createdAt)}</code><strong>{r.adjudicate?"Арбитраж · ":""}{r.decision==="approve"?"Одобрение":"Отхвърляне"}</strong><p>{r.reason}</p></article>)}</div>}
    {proposal.stale && <div className="rs-note"><div><p>Предложението е свързано с предходно издание. Пренасянето проверява съдържанието отново и започва нов независим преглед.</p>
      <button type="button" className="rs-action" disabled={working} onClick={()=>run(()=>send("rebase",{proposalId:proposal.id}),"Предложението е пренесено за нов преглед.")}>Пренеси в текущото издание</button></div></div>}
    {eligible && <form onSubmit={submit}><fieldset className="rs-controls" disabled={working}>
      {proposal.status==="disputed" && !reviews.some(r=>r.adjudicate) && <label className="rs-check"><input type="checkbox" checked={adjudicate} onChange={e=>setAdjudicate(e.target.checked)}/>Записвам независимо арбитражно решение по спора</label>}
      <label className="rs-field">Решение<select value={decision} onChange={e=>setDecision(e.target.value)}><option value="approve">Одобрявам кодирането</option><option value="reject">Отхвърлям кодирането</option></select></label>
      <label className="rs-field">Основания<textarea required rows={3} maxLength={2500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <label className="rs-check"><input type="checkbox" required={decision==="approve"} checked={sourceChecked} onChange={e=>setSourceChecked(e.target.checked)}/>Прегледах оригиналния източник и опциите по въпроса.</label>
      <button className="rs-action rs-primary" disabled={(decision==="approve" && !sourceChecked) || !reason.trim()}>Запиши решението</button>
    </fieldset></form>}
    {author && !proposal.stale && <p>Предложението е твое. Независимата рецензия се попълва от друг редактор.</p>}
    {alreadyReviewed && <p>Твоето решение е записано.</p>}
  </div>;
}

export function Reviews(props) {
  const [filter,setFilter]=useState("all");
  const rows=props.workspace.proposals.filter(p=>filter==="all" || p.status===filter);
  return <section className="rs-box"><h2>Редакторски рецензии</h2><label className="rs-field">Статус<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Всички предложения</option>{["pending","disputed","approved","rejected","published"].map(id=><option key={id} value={id}>{statusNames[id]}</option>)}</select></label>
    {rows.length===0 && <p>Няма предложения с избрания статус.</p>}
    {rows.map(p=><details className="rs-fold" key={p.id}><summary><span><small className="rs-code">{p.evidenceId} · {p.questionId ?? "без въпрос"}</small>{chosenOption(p)}</span><span className="rs-pill">{p.stale?"Предходно издание":statusNames[p.status]??p.status}</span></summary><ReviewForm proposal={p} {...props}/></details>)}
  </section>;
}

export function Publication({workspace,session,working,run}) {
  const [selected,setSelected]=useState([]);
  const [withdrawId,setWithdrawId]=useState(null);
  const [reason,setReason]=useState("");
  const approved=workspace.proposals.filter(p=>p.status==="approved" && !p.stale);
  const ids=approved.filter(p=>selected.includes(p.id)).map(p=>p.id);
  const isAdmin=session.role==="admin";
  function publish() {
    run(async ()=>{
      await send("publish",{proposalIds:ids,baseReleaseId:workspace.currentReleaseId});
      setSelected([]);
    },"Новата версия е публикувана.");
  }
  function withdraw(event) {
    event.preventDefault();
    run(async ()=>{
      await send("withdraw",{releaseId:withdrawId,reason:reason.trim()});
      setWithdrawId(null);setReason("");
    },"Версията е оттеглена.");
  }
  return <>
    {isAdmin && <section className="rs-box"><h2>Публикуване на версия</h2>
      <p>Избери одобрените позиции за включване в следващата публична версия.</p>
      {approved.length===0 ? <p>В момента няма одобрени предложения за публикуване.</p> : <>{approved.map(p=><label key={p.id} className="rs-check rs-selectrow">
        <input type="checkbox" disabled={working} checked={selected.includes(p.id)} onChange={e=>setSelected(list=>e.target.checked?[...list,p.id]:list.filter(id=>id!==p.id))}/>
        <span><code>{p.evidenceId} · {p.questionId??"без въпрос"}</code><strong>{chosenOption(p)}</strong></span></label>)}
        <button className="rs-action rs-primary" disabled={!ids.length||working} onClick={publish}>Публикувай избраните позиции ({ids.length})</button></>}
    </section>}
    <section className="rs-box"><h2>Публикувани версии</h2>{workspace.releases.map(item=><article className="rs-proposal" key={item.id}><small className="rs-code">{when(item.createdAt)}</small><strong>{item.id}</strong>
      <p>{item.withdrawn?"Оттеглена версия":item.id===workspace.currentReleaseId?"Текуща публична версия":"Предходна версия"}</p>
      <a className="rs-link" href={"/polit-compass/api/releases/"+encodeURIComponent(item.id)} target="_blank" rel="noreferrer">Прегледай данните ↗</a>
      {isAdmin && !item.withdrawn && item.parentId && item.id===workspace.currentReleaseId && (withdrawId===item.id ?
        <form onSubmit={withdraw}><label className="rs-field">Основание за оттегляне<textarea required value={reason} onChange={e=>setReason(e.target.value)} rows={2} maxLength={2500}/></label><p>Предходната публикувана версия ще стане отново текуща.</p><div className="rs-row"><button className="rs-action" disabled={working||!reason.trim()}>Потвърди оттеглянето</button><button type="button" className="rs-action" disabled={working} onClick={()=>{setWithdrawId(null);setReason("");}}>Откажи</button></div></form> :
        <div><button className="rs-action" disabled={working} onClick={()=>setWithdrawId(item.id)}>Оттегли версията</button></div>)}
    </article>)}</section>
  </>;
}

function CorrectionRow({item,working,run}) {
  const [status,setStatus]=useState("resolved");
  const [reason,setReason]=useState("");
  function handle(event) {
    event.preventDefault();
    run(()=>send("correction",{id:item.id,status,reason:reason.trim()}),"Сигналът е обработен.");
  }
  return <details className="rs-fold"><summary><span>{item.claim}</span><span className="rs-pill">{statusNames[item.status]??item.status}</span></summary>
    <p>{when(item.createdAt)}</p>{/^https?:\/\//i.test(item.sourceUrl) && <a className="rs-link" href={item.sourceUrl} target="_blank" rel="noreferrer">Посочен източник ↗</a>}
    {["resolved","declined"].includes(item.status) ? <p>{item.reason}</p> :
      <form onSubmit={handle}><label className="rs-field">Решение<select value={status} onChange={e=>setStatus(e.target.value)}><option value="resolved">Разрешен</option><option value="declined">Отхвърлен</option></select></label>
        <label className="rs-field">Основания<textarea required maxLength={2500} rows={2} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <button className="rs-action" disabled={working||!reason.trim()}>Приключи сигнала</button></form>}
  </details>;
}
function useHistoryPage(workspace,type,run) {
  const initial=workspace[type];
  const [pages,setPages]=useState(null);
  const active=pages?.initial===initial ? pages : {initial,extra:[],before:workspace[type+"Before"]};
  function loadMore() {
    run(async()=>{
      const result=await requestJSON("/api/admin/"+type+"?before="+encodeURIComponent(active.before));
      setPages({initial,extra:[...active.extra,...result.rows],before:result.before});
    },null,false);
  }
  return {rows:[...initial,...active.extra],before:active.before,loadMore};
}
export function Corrections({workspace,working,run}) {
  const history=useHistoryPage(workspace,"corrections",run);
  return <section className="rs-box"><h2>Получени сигнали</h2>{history.rows.length ? history.rows.map(item=><CorrectionRow key={item.id} item={item} working={working} run={run}/>) : <p>Все още няма получени сигнали.</p>}
    {history.before && <button className="rs-action" disabled={working} onClick={history.loadMore}>Още сигнали</button>}</section>;
}

export function Members({workspace,working,run}) {
  const [userId,setUserId]=useState("");
  const [removing,setRemoving]=useState(null);
  function grant(event) {
    event.preventDefault();
    run(async()=>{await send("members",{userId:userId.trim(),role:"editor"});setUserId("");},"Редакторският достъп е предоставен.");
  }
  function revoke() {
    run(async()=>{await send("members",{userId:removing,role:null});setRemoving(null);},"Редакторският достъп е премахнат.");
  }
  return <section className="rs-box"><h2>Редакторски достъп</h2><p>Въведи идентификатора, който човекът вижда след вход в редакторското пространство.</p>
    <form onSubmit={grant}><label className="rs-field">Идентификатор на потребителя<input required maxLength={250} value={userId} onChange={e=>setUserId(e.target.value)}/></label><button className="rs-action" disabled={working||!userId.trim()}>Добави редактор</button></form>
    <h3>Назначени редактори ({workspace.members.length})</h3>{workspace.members.map(member=><div className="rs-proposal" key={member.userId}><code>{member.userId}</code>
      {removing===member.userId ? <><p>Да бъде ли отнет редакторският достъп на този профил?</p><div className="rs-row"><button disabled={working} className="rs-action" onClick={revoke}>Потвърди отнемането</button><button disabled={working} className="rs-action" onClick={()=>setRemoving(null)}>Откажи</button></div></> :
        <div><button disabled={working} className="rs-action" onClick={()=>setRemoving(member.userId)}>Отнеми достъпа</button></div>}</div>)}
  </section>;
}

export function Audit({workspace,working,run}) {
  const [filter,setFilter]=useState("");
  const history=useHistoryPage(workspace,"audit",run);
  const entries=history.rows.filter(item=>[item.action,item.objectId,item.actor,item.reason].join(" ").toLowerCase().includes(filter.trim().toLowerCase()));
  return <section className="rs-box"><h2>Дневник на промените</h2><label className="rs-field">Търси в дневника<input type="search" value={filter} placeholder="Действие, обект или редактор" onChange={e=>setFilter(e.target.value)}/></label>
    {entries.length===0 && <p>Няма намерени действия.</p>}{entries.map((item,index)=><article className="rs-proposal" key={item.id??index}><code>{when(item.createdAt)}</code><strong>{item.action}</strong><p>{item.reason}</p><dl className="rs-meta"><div><dt>Извършил</dt><dd>{item.actor}</dd></div><div><dt>Обект</dt><dd>{item.objectId}</dd></div></dl></article>)}
    {history.before && <button className="rs-action" disabled={working} onClick={history.loadMore}>Още записи</button>}
  </section>;
}
