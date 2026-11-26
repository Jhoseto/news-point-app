"use client";

import { useState } from "react";
import questions from "../data/questions.bg.json";

const documentKinds = [
  ["party_programme","Партийна програма"],["party_manifesto","Предизборна програма"],
  ["party_policy_statement","Партийна позиция"],["party_legislative_announcement","Законодателна инициатива"],
  ["official_policy","Официална политика"],["official_registry","Официален регистър"],
  ["official_open_data","Официални отворени данни"],["official_legal_context","Нормативен документ"]
];
const newId = prefix => prefix+"-"+crypto.randomUUID().split("-").join("");

export default function NewEvidence({catalog,working,onPreview}) {
  const [sourceMode,setSourceMode]=useState("existing");
  const [sourceId,setSourceId]=useState(catalog.sources[0]?.id ?? "");
  const [qid,setQid]=useState(questions[0].id);
  const [option,setOption]=useState("");
  const today=new Date().toISOString().slice(0,10);
  const question=questions.find(item=>item.id===qid);
  function submit(event) {
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const text=name=>String(fields.get(name)??"").trim();
    const id=newId("EV");
    const source=sourceMode==="existing" ? sourceId : newId("SRC");
    const evidence={id,sourceId:source,entityId:text("entityId"),questionIds:[qid],claim:text("claim"),locator:text("locator")};
    const packet={evidence:[evidence],proposal:{evidenceId:id,questionId:qid,optionId:option||null,reason:text("reason")}};
    if (sourceMode==="new") {
      packet.sources=[{id:source,title:text("title"),url:text("url"),kind:text("kind"),publishedAt:text("publishedAt")||null,retrievedAt:text("retrievedAt")}];
    }
    onPreview(packet);
  }
  return <form onSubmit={submit}><fieldset disabled={working} className="rs-controls">
    <label className="rs-field">Източник<select value={sourceMode} onChange={e=>setSourceMode(e.target.value)}><option value="existing">Документ от регистъра</option><option value="new">Добави нов публичен документ</option></select></label>
    {sourceMode==="existing" ? <label className="rs-field">Документ<select required value={sourceId} onChange={e=>setSourceId(e.target.value)}>{catalog.sources.map(item=><option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}</select></label> : <>
      <label className="rs-field">Заглавие на оригинала<input name="title" required maxLength={400}/></label>
      <label className="rs-field">Публичен адрес на документа<input name="url" type="url" required placeholder="https://" maxLength={1800}/></label>
      <p>За нов домейн е необходимо той да е разрешен в настройките на редакцията.</p>
      <label className="rs-field">Вид на документа<select name="kind">{documentKinds.map(([kind,label])=><option value={kind} key={kind}>{label}</option>)}</select></label>
      <div className="rs-datefields"><label className="rs-field">Дата на публикация, ако е известна<input type="date" name="publishedAt" max={today}/></label><label className="rs-field">Дата на преглед на оригинала<input type="date" required name="retrievedAt" max={today} defaultValue={today}/></label></div>
    </>}
    <label className="rs-field">Политически субект<select name="entityId">{catalog.entities.map(entity=><option key={entity.id} value={entity.id}>{entity.label} · {entity.id}</option>)}</select></label>
    <label className="rs-field">Твърдение от източника<textarea name="claim" required maxLength={1800} rows={3} placeholder="Преразкажи конкретната позиция с твои думи."/></label>
    <label className="rs-field">Място в оригинала<input name="locator" required maxLength={450} placeholder="Страница или раздел и заглавие на пасажа"/></label>
    <label className="rs-field">Въпрос от компаса<select value={qid} onChange={e=>{setQid(e.target.value);setOption("");}}>{questions.map(q=><option key={q.id} value={q.id}>{q.id} · {q.prompt}</option>)}</select></label>
    <label className="rs-field">Предложена позиция<select value={option} onChange={e=>setOption(e.target.value)}><option value="">Недостатъчно основание за определена опция</option>{question.options.map(o=><option key={o.id} value={o.id}>{o.id} · {o.label}</option>)}</select></label>
    <label className="rs-field">Редакторски основания<textarea name="reason" required rows={3} maxLength={2500} placeholder="Посочи какво свързва твърдението с избраната позиция."/></label>
    <button className="rs-action rs-primary">Провери предложението</button>
  </fieldset></form>;
}
