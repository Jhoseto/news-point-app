"use client";

import { useMemo, useState } from "react";
import scoring from "../data/scoring-model.json";
import report from "../data/report-config.json";
import questions from "../data/questions.bg.json";
import Editorial from "./Editorial";
import { usePublishedRelease } from "./usePublishedRelease";
import "./research.css";

const dateFormat = new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const formatDate = value => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? dateFormat.format(date) : "Без установена дата";
};
const questionById = new Map(questions.map(question => [question.id, question]));
const typeLabels = {
  official_registry: "Официален регистър", official_election: "Изборни резултати",
  official_open_data: "Отворени данни", official_fact: "Институционална справка",
  official_legal_context: "Нормативен документ", discovery_portal: "Справочен портал",
  research_data: "Изследователски данни", methodology: "Методология",
  concept_reference: "Енциклопедична статия", primary_political_charter: "Политическа харта",
  party_programme: "Партийна програма", official_policy: "Официална политика",
  party_manifesto: "Предизборна програма", party_policy_statement: "Партийна позиция",
  party_policy_programme: "Секторна програма", party_legislative_announcement: "Законодателна инициатива",
  official_programme: "Официална програма", official_programme_summary: "Програмно резюме",
  archived_official_programme: "Архивирана програма", official_party_policy_article: "Партийна публикация"
};
const accessLabels = {
  editorial_review: "Редакторски преглед",
  search_index_checked: "Проверен индекс", content_checked: "Прегледано съдържание",
  dynamic_content_unreadable: "Недостъпно динамично съдържание", content_partially_checked: "Частичен преглед",
  access_challenge: "Ограничен достъп", access_403: "Отказан достъп",
  original_pdf_selected_pages_visually_checked: "Прегледани страници от оригинала",
  original_pdf_full_text_checked: "Прегледан оригинален PDF", full_article_checked: "Прегледан пълен текст",
  relevant_full_passages_checked: "Прегледани свързани пасажи"
};
const labels = {
  methodology: ["Методология", "Как работи компасът", "От избора по конкретен въпрос до осем измерения на политическия профил."],
  sources: ["Източници", "Регистър на източниците", "Разгледай оригиналните документи, конкретните пасажи и основанията за включването им."],
  editor: ["Редакция", "Редакторско пространство", "Преглед на доказателства, независимо рецензиране и публикуване на версии."]
};

function Icon({ name }) {
  const paths = {
    arrow: "m9 6-6 6 6 6M3 12h18", link: "M7 17 17 7M7 7h10v10",
    search: "M15.5 15.5 21 21 M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0",
    plus: "M5 12h14M12 5v14", book: "M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3zM12 6v15",
    compass: "M12 2v3M12 19v3M2 12h3M19 12h3M16.5 7.5l-3 6-6 3 3-6z"
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

function StatStrip({ entries }) {
  return <dl className="rs-stats">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function Methodology({release}) {
  const [axisId, setAxisId] = useState(scoring.axes[0].id);
  const [questionId, setQuestionId] = useState(questions[0].id);
  const axis = scoring.axes.find(item => item.id === axisId);
  const detail = report.axes[axisId];
  const question = questionById.get(questionId);
  return <>
    <StatStrip entries={[["въпроса", questions.length], ["тематични раздела", scoring.sections.length], ["описателни индекса", scoring.axes.length]]} />
    <section className="rs-box"><h2>Отговорите зад индекса</h2>
      <p>Всеки избран отговор описва конкретна политика. Всички избори влизат в тематичния доклад. Всяка ос обобщава само въпросите, свързани с нея.</p>
      <label className="rs-field">Разгледай ос<select value={axisId} onChange={e => setAxisId(e.target.value)}>{scoring.axes.map(a => <option key={a.id} value={a.id}>{report.axes[a.id].title}</option>)}</select></label>
      <div className="rs-axis" key={axisId}>
        <div className="rs-scale" aria-hidden="true"><span>−100</span><span>0</span><span>+100</span></div>
        <div className="rs-ends"><b>{detail.negativeLabel}</b><b>{detail.positiveLabel}</b></div>
        <p>За резултат са нужни поне {axis.minAnswered} от {axis.bindings.length} отговора.</p>
        <ul>{axis.bindings.map(binding => <li key={binding.questionId}><code>{binding.questionId}</code>{questionById.get(binding.questionId).prompt}</li>)}</ul>
      </div>
      <details className="rs-fold"><summary>Как се изчислява стойността?<Icon name="plus" /></summary>
        <p>Избраната опция има вътрешен код от −2 до +2. Умножаваме кода по посоката му за съответната ос, осредняваме наличните стойности и умножаваме по 50. Пропуснат въпрос не участва в средната стойност. Нулевият код е реален избор.</p>
        <p>Например изборите E01_B, E02_C и E07_B дават (+2 + 2 − 2) ÷ 3 × 50 ≈ +33 за данъци и преразпределение. Отбелязването на дадена тема като особено важна влияе само върху персонализираното партийно сравнение.</p>
      </details>
    </section>
    <section className="rs-box"><h2>Отделният въпрос</h2>
      <p>Две опции могат да имат еднакъв числов код и различен политически смисъл. Тук можеш да провериш точната формулировка и публикуваното правило за близост между всеки два отговора.</p>
      <label className="rs-field">Избери въпрос<select value={questionId} onChange={e => setQuestionId(e.target.value)}>{questions.map(q => <option key={q.id} value={q.id}>{q.id} · {q.prompt}</option>)}</select></label>
      <div className="rs-options">{question.options.map(option => <div key={option.id}><code>{option.id}</code><p>{option.label}</p></div>)}</div>
      <details className="rs-fold"><summary>Матрица за сходство и обосновка<Icon name="plus" /></summary>
        <div className="rs-tablewrap"><table><caption>Сходство между опциите по {question.id} (0–100)</caption><thead><tr><th scope="col">Опция</th>{question.options.map(o => <th scope="col" key={o.id}>{o.id}</th>)}</tr></thead>
          <tbody>{question.options.map(a => <tr key={a.id}><th scope="row">{a.id}</th>{question.options.map(b => <td key={b.id}>{question.similarities[a.id][b.id]}</td>)}</tr>)}</tbody></table></div>
        <p>{question.similarityRationale}</p>
        {question.options.map(o => <p key={o.id}><code>{o.id}</code> {o.codingNote}</p>)}
      </details>
    </section>
    <section className="rs-box"><h2>Как да четеш резултата</h2>
      <details className="rs-fold"><summary>Какво означава средата на скалата?<Icon name="plus" /></summary><p>Нулата обозначава средата на редакторската скала. Смесените позиции по различни политики могат да дадат същата стойност като поредица от умерени избори. Връзките към отделните отговори показват разликата.</p></details>
      <details className="rs-fold"><summary>Как се определят идейните допирни точки?<Icon name="plus" /></summary><p>Всяко направление има публикувани условия за конкретни оси или отговори. Съвпадението описва близост по разглежданите политики. Праговете са редакторски решения в изследователска версия и предстои да бъдат проверени емпирично.</p></details>
      <details className="rs-fold"><summary>Кога е възможно партийно сравнение?<Icon name="plus" /></summary><p>Общото сравнение изисква поне {scoring.partyThresholds.minAnswered} избрани отговора и поне {scoring.partyThresholds.minAnsweredPerSection} във всеки раздел. Поне два субекта трябва да имат одобрени позиции за всички сравнявани отговори от общото ядро. В тази версия има {release.counts.approvedPositions} одобрени позиции.</p></details>
      <details className="rs-fold"><summary>Версии на данните и модела<Icon name="plus" /></summary><dl className="rs-meta">{[["Въпросник",release.questionVersion],["Модел",release.scoringVersion],["Доклад",release.reportVersion],["Източници",release.sourceSnapshotVersion],["Партиен набор",release.partyDatasetVersion]].map(([a,b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl></details>
    </section>
  </>;
}

function matchesSource(source, needle, records, entityById) {
  if (!needle) return true;
  const metadata = [source.id, source.title, source.use, source.url, typeLabels[source.kind]];
  return metadata.concat(records.flatMap(e => [e.id, e.claim, e.locator, e.topic, ...e.questionIds, entityById.get(e.entityId)?.label])).join(" ").toLocaleLowerCase("bg").includes(needle);
}

function SourceRecord({ source, records, entityById }) {
  return <details className="rs-source">
    <summary><span className="rs-sourceicon"><Icon name="book" /></span><span className="rs-sourcetitle"><small>{source.id} · {typeLabels[source.kind]??source.kind}</small><strong>{source.title}</strong></span><Icon name="plus" /></summary>
    <div className="rs-sourcebody"><p>{source.use}</p>
      <dl className="rs-meta">{[["Публикуван",formatDate(source.publishedAt)],["Прегледан",formatDate(source.retrievedAt)],["Достъп при прегледа",accessLabels[source.accessStatus] ?? source.accessStatus]].map(([a,b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
      <a className="rs-link" href={source.url} target="_blank" rel="noreferrer">Отвори оригинала<Icon name="link" /></a>
      {records.length > 0 && <div className="rs-evidence"><h3>Доказателствени записи ({records.length})</h3>{records.map(record => <article key={record.id}><small>{record.id} · {entityById.get(record.entityId)?.label} · {record.status==="source_checked"?"Проверен произход":"За проверка"}</small><strong>{record.claim}</strong><p>{record.locator}</p><p>{record.scoreReason}</p>{record.questionIds.length > 0 && <div className="rs-chips">{record.questionIds.map(id => <code key={id}>{id}</code>)}</div>}</article>)}</div>}
    </div>
  </details>;
}

function Sources({catalog}) {
  const [query,setQuery] = useState("");
  const [filter,setFilter] = useState("all");
  const [limit,setLimit] = useState(12);
  const {sources,evidence,entities,release} = catalog;
  const entityById = useMemo(()=>new Map(entities.map(item=>[item.id,item])),[entities]);
  const evidenceBySource = useMemo(()=>{
    const groups=new Map(sources.map(item=>[item.id,[]]));
    evidence.forEach(row=>groups.get(row.sourceId)?.push(row));
    return groups;
  },[sources,evidence]);
  const visible = sources.filter(source => (filter === "all" || (filter === "evidence" ? evidenceBySource.get(source.id).length > 0 : ["research_data", "methodology", "concept_reference", "primary_political_charter"].includes(source.kind))) && matchesSource(source,query.trim().toLocaleLowerCase("bg"), evidenceBySource.get(source.id),entityById));
  return <>
    <StatStrip entries={[["източника", sources.length], ["доказателствени записа", evidence.length], ["одобрени позиции", release.counts.approvedPositions]]} />
    <section className="rs-box"><h2>Търсене в регистъра</h2>
      <label className="rs-search"><Icon name="search" /><input aria-label="Търси източник, институция или тема" type="search" value={query} placeholder="Източник, институция или тема" onChange={e => {setQuery(e.target.value);setLimit(12);}} /></label>
      <div className="rs-chips">{[["all","Всички"],["evidence","С доказателствени записи"],["method","Методология и понятия"]].map(([id,label]) => <button type="button" key={id} aria-pressed={filter===id} onClick={() => {setFilter(id);setLimit(12);}}>{label}</button>)}</div>
      <p className="rs-count" role="status">{visible.length} от {sources.length} източника</p>
      <div className="rs-sourcelist">{visible.slice(0,limit).map(source => <SourceRecord key={source.id} source={source} records={evidenceBySource.get(source.id)} entityById={entityById} />)}</div>
      {visible.length === 0 && <div className="rs-empty"><h3>Няма съвпадения</h3><button className="rs-action" onClick={() => { setQuery(""); setFilter("all"); setLimit(12); }}>Изчисти търсенето и филтрите</button></div>}
      {visible.length > limit && <button className="rs-action" onClick={() => setLimit(limit+12)}>Покажи още {Math.min(12,visible.length-limit)} източника</button>}
    </section>
    <aside className="rs-note"><Icon name="compass" /><p>Партийните програми и извлечените твърдения са публикувани за проследимост. За включване в сравнение всяка позиция преминава отделен човешки преглед спрямо текущия въпросник.</p></aside>
  </>;
}

export default function Research({section="methodology",onExit,onNavigate}) {
  const [revision,setRevision]=useState("");
  const catalog = usePublishedRelease(section+"/"+revision);
  const current = labels[section] ? section : "methodology";
  const [name, title, subtitle] = labels[current];
  return <div className="rs-page"><div className="rs-shell">
    {onExit && <button className="rs-back" onClick={onExit}><Icon name="arrow" />Към началото</button>}
    <header className="rs-intro"><div className="rs-kicker"><span />{name} <span className="rs-date">{formatDate(catalog.release.asOf)}</span></div><h1>{title}</h1><p>{subtitle}</p></header>
    {catalog.fallback && current !== "editor" && <aside className="rs-note" role="status"><p>Показана е включената версия от {formatDate(catalog.release.asOf)}. В момента няма връзка с регистъра на публикуваните версии.</p></aside>}
    {current==="sources" ? <Sources catalog={catalog}/> : current==="editor" ? <Editorial catalog={catalog} onReleaseChange={setRevision}/> : <Methodology release={catalog.release}/>}
    {onNavigate && current !== "editor" && <nav className="rs-related" aria-label="Свързани материали">
      <button className="rs-action" onClick={() => onNavigate(current === "sources" ? "methodology" : "sources")}>{current === "sources" ? "Разгледай методологията" : "Разгледай регистъра на източниците"} <Icon name="link" /></button>
      {current==="sources" && <a className="rs-action" href="#corrections" onClick={e=>{e.preventDefault();onNavigate("corrections");}}>Подай сигнал за корекция</a>}
    </nav>}
  </div></div>;
}
