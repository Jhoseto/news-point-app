import { useEffect, useState } from 'react';
import { topics } from '../data/world-questions.mjs';
import { partyComparison } from '../src/bg-comparison.mjs';
import { commonTopics } from '../src/report-insights.mjs';

// Version 1 fixes the order of both vectors independently of report ranking.
const axisIds = ['welfare','market','liberty','voice','local','custom','migration','world','green','change'];
const partyOrder = partyComparison().parties.slice().sort((a,b) => a.partyId.localeCompare(b.partyId));
const axisLabels = axisIds.map(id => topics.find(topic => topic.id === id));
async function request(body, signal) {
  const response = await fetch('/polit-compass/compare/', { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(response.status === 404 ? 'Провери двата кода и опитай отново.' :
    response.status === 429 ? 'Изчакай минута и опитай отново.' : 'Връзката прекъсна. Опитай отново.');
  return response.json();
}

export function ShareReport({axes, answers, reportKey}) {
  const parties = partyComparison(answers).parties;
  const snapshot = JSON.stringify({ version: 1,
    axes: axisIds.map(id => { const score = axes.find(a => a.id === id)?.score; return score == null ? null : Math.round(score * 100); }),
    parties: partyOrder.map(p => parties.find(item => item.partyId === p.partyId)?.share ?? null) });
  const [saved, setSaved] = useState(null);
  const [attempt, retry] = useState(0);
  const [compare, setCompare] = useState(false);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    request({ key: reportKey, snapshot: JSON.parse(snapshot) }, controller.signal)
      .then(({code}) => { if (!controller.signal.aborted) setSaved({ snapshot, code }); })
      .catch(error => { if (!controller.signal.aborted) setSaved({ snapshot, error: error.message }); });
    return () => controller.abort();
  }, [reportKey, snapshot, attempt]);
  const result = saved?.snapshot === snapshot ? saved : null;
  return <section className="pc-sharing"><h2>Твоят код за сравнение</h2>
    <p>Всеки, на когото дадеш кода, може да сравни обобщените ти резултати със своите. Отделните ти отговори остават при теб.</p>
    <div aria-live="polite">{result?.code ? <strong className="pc-code">{result.code}</strong> : result?.error ?
      <>{result.error} <button className="pc-text-action" onClick={() => {setSaved(null); retry(n => n + 1);}}>Опитай отново</button></> : 'Създаваме твоя код…'}</div>
    {result?.code && <div className="pc-share-actions"><button className="pc-text-action" onClick={async () => {
      try { await navigator.clipboard.writeText(result.code); setCopied(result.code); }
      catch { setCopied('manual'); }
    }}>{copied === result.code ? 'Кодът е копиран' : 'Копирай кода'}</button>
      {!compare && <button className="pc-text-action" onClick={() => setCompare(true)}>Сравни с приятел</button>}</div>}
    {copied === 'manual' && <p role="status">Маркирай шестте знака и ги копирай.</p>}
    {result?.code && compare && <Comparison key={result.code} initial={result.code}/>}</section>;
}

function PairReading({pair, codes}) {
  const topics = commonTopics(pair, axisLabels);
  if (!topics.length) return <p>Двата анализа нямат обща измерена тема.</p>;
  const low = topics[0].gap, high = topics.at(-1).gap;
  const names = gap => topics.filter(t => t.gap === gap).map(t => t.title).join(', ');
  return <section className="pc-pair-reading"><h3>Къде се срещат възгледите ви?</h3>
    {low === high ? <p>{topics.length === 1 ? 'Обща измерена тема' : low === 0 ? 'Позициите ви съвпадат по всички общи теми' : 'Разликата е еднаква по всички общи теми'} — {names(low)}.</p> :
      <><p><strong>Най-близки сте по</strong> {names(low)}.</p><p><strong>Най-много се различавате по</strong> {names(high)}.</p></>}
    <p>Кръгът показва {codes[0]}, ромбът — {codes[1]}.</p>
    {topics.map(t => <div className="pc-pair-topic" key={t.id}><strong>{t.title}</strong> <small>{t.a} / {t.b}</small>
      <span className="pc-pair-track" aria-hidden="true"><i style={{left:(t.a+100)/2+'%'}}/><b style={{left:(t.b+100)/2+'%'}}/></span>
      <div className="pr-poles"><span>{t.poles[0]}</span><span>{t.poles[1]}</span></div></div>)}
  </section>;
}

export function Comparison({ initial = '' }) {
  const [codes, setCodes] = useState([initial,'']);
  const [pair, setPair] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setPair(null); setError('');
    if (codes[0] === codes[1]) { setError('Въведи два различни кода.'); return; }
    setBusy(true);
    try { setPair(await request({codes})); } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function rows(key, labels, format) {
    return labels.map((label,i) => <tr key={label}><th scope="row">{label}</th>{pair.map((p,j) =>
      <td key={j}>{p[key][i] == null ? '—' : format(p[key][i])}</td>)}</tr>);
  }
  return <section className="pc-pair"><h2>Сравни два анализа</h2>
    <form onSubmit={submit}>{codes.map((code,i) => <label key={i}>{i ? 'Код на приятел' : 'Твоят код'}
      <input required maxLength={6} minLength={6} pattern="[A-HJ-NP-Z2-9]{6}" autoCapitalize="characters" spellCheck={false}
        autoComplete="off" disabled={busy} value={code} onChange={e => {setPair(null); setError('');
        setCodes(codes.map((old,j) => j === i ? e.target.value.trim().toUpperCase() : old));}}/></label>)}
      <button className="pc-primary" disabled={busy}>{busy ? 'Зареждане…' : 'Сравни'}</button></form>
    {error && <p role="alert">{error}</p>}
    {pair && <div aria-live="polite"><PairReading pair={pair} codes={codes}/><details><summary>Точни стойности по всички теми</summary><p>По всяка тема първата позиция е −100, втората е +100. Тире означава недостатъчно данни.</p>
      <table><caption>Позиции по теми</caption><thead><tr><th scope="col">Тема и посоки</th>{codes.map(c => <th scope="col" key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows('axes',axisLabels.map(a => a.title + ' · ' + a.poles.join(' / ')), n => n > 0 ? '+' + n : n)}</tbody></table></details>
      <table><caption>Разпределение на партийната близост</caption><thead><tr><th scope="col">Парламентарна група</th>{codes.map(c => <th scope="col" key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows('parties',partyOrder.map(p => p.name), n => n + '%')}</tbody></table></div>}
  </section>;
}
