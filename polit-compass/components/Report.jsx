import { useMemo, useState } from 'react';
import { buildWorldProfile } from '../src/world-profile.mjs';
import { totalQuestions } from '../src/world-session.mjs';
import { refinements } from '../data/world-refinement.mjs';
import PartyAffinity from './PartyAffinity';
import { ShareReport } from './Comparison';
import { decisionExamples } from '../src/report-insights.mjs';

const signed = value => {
  const score = Math.round(value * 100);
  return score > 0 ? '+' + score : String(score).replace('-', '−');
};

function axisLabel(axis) {
  if (axis.score === null) return 'Недостатъчно отговори';
  if (Math.abs(axis.score) < .35) return axis.mixed ? 'Различни позиции според случая' : 'Междинна позиция';
  return axis.poles[Number(axis.score > 0)];
}

function AxisTrack({score, reference}) {
  return <span className="pr-axis-track" aria-hidden="true">
    {reference !== undefined && <i className="pr-reference" style={{ left: (reference + 1) * 50 + '%' }}/>}
    {score !== null && <i className="pr-you" style={{ left: (score + 1) * 50 + '%' }}/>}
  </span>;
}

function TraditionReading({ranked}) {
  if (ranked.length === 0) return null;
  const lead = ranked[0];
  const peers = ranked.filter(item => lead.similarity - item.similarity < 4);
  const shown = peers.slice(0, 3).map(r => '„' + r.name + '“ (' + r.similarity + '/100)');
  const labels = shown.length === 1 ? shown[0] : shown.slice(0,-1).join(', ') + ' и ' + shown.at(-1);
  return <p className="pr-tradition-reading">{lead.similarity < 72
    ? 'Според теста нямаш изразена близост до една традиция. Най-близките ориентири включват ' + labels + '.'
    : peers.length === 1 ? 'Според теста най-голямо сходство имаш с ' + labels + '.'
    : 'Според теста съчетаваш позиции, близки до ' + labels + (peers.length > shown.length ? '. Още ' + (peers.length - shown.length) + ' традиции са в същия диапазон.' : '.')}</p>;
}

function CompassMap({axes}) {
  const [xId, setX] = useState(null);
  const [yId, setY] = useState(null);
  const x = axes.find(a => a.id === xId) ?? axes.find(a => a.id !== yId);
  const y = axes.find(a => a.id === yId && a.id !== x?.id) ?? axes.find(a => a.id !== x?.id);
  if (!x || !y) return null;
  const available = x.score !== null && y.score !== null;
  const px = 20 + (x.score + 1) * 130, py = 160 - (y.score + 1) * 70;
  return <section className="pr-card pr-cartography">
    <h2>Карта на възгледите</h2>
    <div className="pr-select-pair">
      <label>Хоризонтално<select value={x.id} onChange={e => { setX(e.target.value); setY(y.id); }}>
        {axes.filter(a => a.id !== y.id).map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
      <label>Вертикално<select value={y.id} onChange={e => { setY(e.target.value); setX(x.id); }}>
        {axes.filter(a => a.id !== x.id).map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
    </div>
    <figure className="pr-map" aria-live="polite">
      <span className="pr-map-pole">{y.poles[1]} ↑</span>
      <svg viewBox="0 0 300 180" aria-label={available ? x.title + ' ' + signed(x.score) + ', ' + y.title + ' ' + signed(y.score) : 'Недостатъчно данни за избраните оси'} role="img">
        <rect x="20" y="20" width="130" height="70" fill="color-mix(in srgb, var(--np-link) 10%, var(--np-surface))"/>
        <rect x="150" y="20" width="130" height="70" fill="color-mix(in srgb, var(--np-accent-2) 10%, var(--np-surface))"/>
        <rect x="20" y="90" width="130" height="70" fill="var(--np-surface-2)"/>
        <rect x="150" y="90" width="130" height="70" fill="color-mix(in srgb, var(--np-accent) 12%, var(--np-surface))"/>
        {Array.from({length: 11}, (_, i) => <g key={i} stroke={i === 5 ? 'var(--np-muted)' : 'var(--np-faint)'} strokeWidth={i === 5 ? 1.1 : .45}>
          <path d={'M ' + (20 + i * 26) + ' 20 v 140'}/><path d={'M 20 ' + (20 + i * 14) + ' h 260'}/>
        </g>)}
        {available && <g>
          <path d={'M 150 ' + py + ' H ' + px + ' V 90'} stroke="var(--pr-reader)" strokeDasharray="3 3" fill="none"/>
          <circle cx={px} cy={py} r="8.4" fill="var(--pr-reader)" opacity=".2"/>
          <circle cx={px} cy={py} r="4.8" fill="var(--pr-reader)" stroke="white" strokeWidth="1.4"/>
        </g>}
      </svg>
      <div className="pr-poles"><span>← {x.poles[0]}</span><span>{x.poles[1]} →</span></div>
      <span className="pr-map-pole">↓ {y.poles[0]}</span>
      <figcaption>{available && <><i className="pr-key-dot"/> Твоята позиция <b>{signed(x.score)} / {signed(y.score)}</b></>}</figcaption>
    </figure>
  </section>;
}

function Traditions({ranked}) {
  const [selectedName, setSelectedName] = useState(null);
  if (!ranked.length) return null;
  const selected = ranked.find(r => r.name === selectedName) ?? ranked[0];
  const leading = ranked.filter(r => r.similarity >= ranked[Math.min(2, ranked.length - 1)].similarity);
  return <section className="pr-card">
    <h2>Близки политически традиции</h2>
    <p className="pr-sub">Сходство по скала от 0 до 100. За избраната традиция сравнението обхваща {selected.terms.length} измерени теми.</p>
    <div className="pr-tradition-bars">{leading.map(r => <button key={r.name} type="button" aria-pressed={selected.name === r.name} onClick={() => setSelectedName(r.name)}>
      <span><strong>{r.name}</strong><b>{r.similarity}</b></span><i><i style={{width:r.similarity+'%'}}/></i>
    </button>)}</div>
    <label className="pr-choice-label">Разгледай традиция
      <select value={selected.name} onChange={e => setSelectedName(e.target.value)}>{ranked.map(r =>
        <option key={r.name} value={r.name}>{r.name} · {r.similarity}/100</option>)}</select>
    </label>
    <div className="pr-compare" aria-live="polite">
      <div className="pr-legend"><span><i className="pr-key-dot"/>Ти</span><span><i className="pr-key-reference"/>{selected.name}</span></div>
      {selected.terms.map(({ axis, target }) => <div key={axis.id}>
        <div className="pr-term-title"><span>{axis.title}</span><small>{signed(axis.score)} / {signed(target)}</small></div>
        <AxisTrack score={axis.score} reference={target}/>
        <div className="pr-poles"><span>{axis.poles[0]}</span><span>{axis.poles[1]}</span></div>
      </div>)}
    </div>
  </section>;
}

function AxisDetails({axis}) {
  const scores = [-1, -.5, 0, .5, 1];
  const title = axisLabel(axis);
  return <details className="pr-axis">
    <summary><span className="pr-axis-title"><strong>{axis.title}</strong><span>{axis.score === null ? '—' : signed(axis.score)}</span></span>
      <AxisTrack score={axis.score}/><span className="pr-axis-label">{title}<span aria-hidden="true">⌄</span></span>
    </summary>
    <div className="pr-axis-detail">
      <div className="pr-poles"><span>{axis.poles[0]}</span><span>{axis.poles[1]}</span></div>
      <div className="pr-distribution" aria-label={'Разпределение на ' + axis.count + ' отговора'}>{scores.map(value => {
        const count = axis.values.filter(v => v === value).length;
        return <div key={value}><span>{count}</span><i style={{height: (2 + count*6) + 'px'}}/><small>{signed(value)}</small></div>;
      })}</div>
      <small>{axis.direct ? 'Изрично посочена позиция' : `${axis.count} от ${axis.total} отговора`}</small>
    </div>
  </details>;
}

function Structure({institutions, territory}) {
  if (!institutions.answered && !territory.answered) return null;
  return <div className="pr-structure">
    {[[institutions, 'Държавен глава'], [territory, 'Държава и региони']].filter(([result]) => result.answered).map(([result, dimension]) =>
      <details key={dimension}><summary><span>{dimension}</span><strong>{result.label}</strong></summary><p>{result.explanation}</p></details>)}
  </div>;
}

function RefineOrientation({answers, onChange, measuredCount}) {
  return <details className="pr-card pr-refine">
    <summary>Уточни световната си ориентация</summary>
    <p className="pr-sub">Посочи предпочитанията си по десет теми за сравнение с политическите традиции. Можеш да добавиш и предпочитана държавна форма. Тези уточнения са по желание и не променят партийните проценти.</p>
    <div className="pr-select-pair">{refinements.map(q =>
      <label key={q.id}>{q.title}
        <select value={answers[q.id] ?? ''} onChange={e => {
          const choice = q.options.find(o => String(o.value) === e.target.value);
          onChange(q.id, choice?.value ?? null);
        }}>
          <option value="">Без уточнение</option>
          {q.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>)}</div>
    <p className="pr-note" aria-live="polite">Определени теми за световния профил · {measuredCount} от 10</p>
  </details>;
}

export default function Report({answers, reportKey, shared, onShared, onAnswerChange, onEdit, onRestart}) {
  const {axes, ranked, answered, institutions, territory, portrait, motionProfile} = useMemo(() => buildWorldProfile(answers), [answers]);
  const measured = axes.filter(axis => axis.score !== null);
  const {examples, difference} = decisionExamples(answers, ranked[0]);
  const motionAxes = motionProfile.axes.filter(axis => axis.score !== null);
  const chartAxes = measured.length ? measured : motionAxes;
  const explicit = institutions.descriptor ?? (territory.status === 'federal' ? territory.descriptor : null);
  return <article className="pr-report">
    <header className="pr-hero">
      <p className="pr-kicker">Личен политически профил <span>{answered} / {totalQuestions} отговора</span></p>
      <h1>{ranked.length ? (ranked[0].similarity < 72 ? 'Профил без ясно водеща традиция' : portrait.title) : motionProfile.title}</h1>
      {ranked.length ? <TraditionReading ranked={ranked}/> : answered > 0 && <p className="pr-lead">{measured.length ? 'Картата показва приоритетите ти по темите с достатъчно отговори.' : motionAxes.length ? 'Резултатът описва избора ти по конкретните предложения.' : 'Добави още решения по обща тема, за да се очертае посока.'}</p>}
      {!ranked.length && explicit && <p className="pr-note">Изрично предпочитание · {explicit}</p>}
      {answered === 0 && !ranked.length && <p className="pr-lead">Добави отговори по предложенията, за да видиш в каква посока сочат възгледите ти.</p>}
      {examples.length > 0 && <div className="pr-examples"><h2>Кои твои решения обясняват близостта с {ranked[0].name.toLocaleLowerCase('bg')}?</h2>
        {examples.map(item => <p key={item.topic}><strong>{item.topic}</strong><br/>„{item.label}“</p>)}</div>}
      {difference && <p className="pr-sub">По темата „{difference.axis.title}“ поставяш по-силен акцент върху „{difference.axis.poles[Number(difference.axis.score > difference.target)]}“, отколкото предполага моделът за {ranked[0].name.toLocaleLowerCase('bg')}.</p>}
    </header>
    <PartyAffinity answers={answers} onChange={onAnswerChange}/>
    <ShareReport axes={axes} answers={answers} reportKey={reportKey} shared={shared} onShared={onShared}/>
    {chartAxes.length >= 2 && <div className="pr-charts"><CompassMap axes={chartAxes}/>{ranked.length ? <Traditions ranked={ranked}/> : <section className="pr-card"><h2>Позиции по теми</h2>
      <p className="pr-sub">Отвори тема за разпределението на отговорите ти.</p>
      <div className="pr-axes">{chartAxes.map(axis => <AxisDetails key={axis.id} axis={axis}/>)}</div>
    </section>}</div>}
    {chartAxes.length === 1 && <section className="pr-card"><h2>Позиция по темата</h2><AxisDetails axis={chartAxes[0]}/></section>}
    <RefineOrientation answers={answers} onChange={onAnswerChange} measuredCount={measured.length}/>
    <Structure institutions={institutions} territory={territory}/>
    <details className="pr-method"><summary>Как се изчислява политическият профил?</summary>
      <p>При по-ранните отговори без посочен мотив картата обединява предложения с обща насока. За тема са нужни поне два отговора с посока. „За“ и „против“ имат стойности +100 и −100. Колебливите им варианти дават +50 и −50. „Въздържам се“ и пропуснатите въпроси нямат посока за тази карта.</p>
      <p>Оценяваме изрично изразения приоритет по съответната ос. Условен отговор без определима посока не добавя точки по нея. По дадена ос обобщаваме поне три отговора или ползваме изричното ти уточнение. При новите решения сравняваме традиции след поне пет измерени оси. За всяка показана традиция трябва да има поне три измерени оси, по които тя има зададена позиция.</p>
      <p>Сходството със световните традиции е авторски модел. Сравняваме позициите по характерните за всяка традиция теми с равна тежест. В заглавието посочваме една традиция при индекс поне 72 от 100 и преднина поне 4 точки. Формата на управление и регионалното устройство идват от отделните ти отговори за тях.</p>
    </details>
    <div className="pc-nav"><button onClick={onEdit}>Промени отговорите</button><button onClick={onRestart}>Започни нов тест</button></div>
  </article>;
}

