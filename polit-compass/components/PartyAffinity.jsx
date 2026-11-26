import { useMemo, useState } from 'react';
import { MIN_COMPARISON_ANSWERS, MIN_COMPARISON_AREAS, partyComparison } from '../src/bg-comparison.mjs';
import { resolveChoice, votes } from '../data/bg-votes.mjs';
import { voteCsv } from '../data/bg-vote-sources.mjs';
import PartyQuestions from './PartyQuestions';
import ProgramEvidence from './ProgramEvidence';

const groupColors = { pb: '#457a69', gerb: '#a65e41', dps: '#6982a0', db: '#a88648', pp: '#796e92', vaz: '#60858b' };
const percent = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('bg-BG', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });

function VoteEvidence({ answers, parties }) {
  const [motionId, setMotionId] = useState(votes[0].id);
  const motion = votes.find(vote => vote.id === motionId);
  const option = resolveChoice(motionId, answers[motionId]);
  const csv = motion.groupCsv ?? voteCsv[motion.date];
  return <details className="pr-vote-method">
    <summary>Как гласува всяка група по всеки въпрос?</summary>
    <label className="pr-choice-label">Предложение
      <select value={motionId} onChange={e => setMotionId(e.target.value)}>
        {votes.map((vote, i) => <option key={vote.id} value={vote.id}>{i + 1}. {vote.topic}</option>)}
      </select>
    </label>
    <p>{motion.prompt}</p>
    <p className="pr-sub">{option ? 'Твоят отговор е „' + option.label + '“.' : 'Пропуснал си този въпрос.'}</p>
    {option && <p className="pr-sub">{option.ballotIndex == null ? 'Този избор не определя еднозначен парламентарен вот и е извън партийното сравнение.' : 'В партийното сравнение се отчита като „' + ['за', 'против', 'въздържал се'][option.ballotIndex] + '“.'}</p>}
    <table className="pr-roll-table">
      <caption>Подадени гласове · {date.format(new Date(motion.date))} · № {motion.number}</caption>
      <colgroup><col/>{[0, 1, 2].map(i => <col key={i} className={option?.ballotIndex === i ? 'pr-chosen-vote' : undefined}/>)}</colgroup>
      <thead><tr><th scope="col">Група</th><th scope="col">За</th><th scope="col">Против</th><th scope="col">Въздържали се</th></tr></thead>
      <tbody>{parties.map(party => {
        const counts = motion.groups[party.partyId];
        const most = Math.max(...counts);
        return <tr key={party.partyId}><th scope="row">{party.shortName}</th>
          {counts.map((count, i) => <td key={i}>{count === most ? <strong>{count}</strong> : count}</td>)}
        </tr>;
      })}</tbody>
    </table>
    <div className="pr-source-links">
      <a href={motion.billUrl} target="_blank" rel="noreferrer">Документи по предложението ↗</a>
      {motion.transcriptUrl && motion.transcriptUrl !== motion.billUrl &&
        <a href={motion.transcriptUrl} target="_blank" rel="noreferrer">Стенограма ↗</a>}
      <a href={motion.sourceUrl} target="_blank" rel="noreferrer">Официален вот № {motion.number} ↗</a>
      {csv && <a href={csv} target="_blank" rel="noreferrer">Гласове по групи (CSV) ↗</a>}
    </div>
  </details>;
}

function ShareChart({ parties, selected, onSelect }) {
  let end = 0;
  const stops = parties.map(party => {
    const start = end;
    end += party.share;
    return groupColors[party.partyId] + ' ' + start + '% ' + end + '%';
  });
  return <div className="pr-share-chart">
    <div className="pr-share-ring" aria-hidden="true" style={{ background: 'conic-gradient(' + stops.join(', ') + ')' }}>
      <span><b>{selected.share}%</b><small>{selected.shortName}</small></span>
    </div>
    <div className="pr-share-legend" role="group" aria-label="Дял от общото сходство">
      {parties.map(party => <button key={party.partyId} type="button" aria-pressed={selected.partyId === party.partyId}
        onClick={() => onSelect(party.partyId)}>
        <i aria-hidden="true" style={{ backgroundColor: groupColors[party.partyId] }}/>
        <span>{party.shortName}</span><b>{party.share}%</b>
      </button>)}
    </div>
  </div>;
}

export default function PartyAffinity({ answers, onChange }) {
  const result = useMemo(() => partyComparison(answers), [answers]);
  const { parties, ranking, answered, total, snapshotLabel } = result;
  const insufficient = ranking.status === 'insufficient';
  const ranked = ranking.status === 'ranked' || ranking.status === 'tie';
  const [chosenId, setChosenId] = useState(null);
  const [editing, setEditing] = useState(insufficient);
  const winners = parties.filter(p => ranking.winnerIds.includes(p.partyId));
  const selected = parties.find(p => p.partyId === chosenId) ?? winners[0] ?? parties[0];
  const heading = ranked
    ? winners.length === 1 ? 'Най-близо си до ' + winners[0].shortName : 'Няколко групи са еднакво близки до теб'
    : insufficient ? 'Нужни са още позиции' : 'Няма съвпадение с подадените гласове';

  return <section className="pr-card pr-parties" aria-labelledby="pr-party-title">
    <div className="pr-kicker">Сравнение с България <span>{answered} от {total} позиции</span></div>
    {editing ? <>
      <h2 id="pr-party-title">Как би гласувал?</h2>
      <div className="pr-question-editor"><PartyQuestions answers={answers} onChange={onChange}/></div>
      {insufficient && <p className="pr-sub">За сравнение са нужни поне {MIN_COMPARISON_ANSWERS} отговора в {MIN_COMPARISON_AREAS} тематични области.</p>}
      <button className="pr-finish-edit" type="button" onClick={() => setEditing(false)}>Виж сравнението</button>
    </> : <>
      <h2 id="pr-party-title">{heading}</h2>
      {ranking.status === 'tie' && <p className="pr-sub">{winners.map(p => p.shortName).join(', ')} делят първото място.
        {winners.some(party => party.share !== winners[0].share) && ' Разликата от един пункт в графиката идва от закръглянето.'}</p>}
      {ranked && <>
        <p className="pr-sub">{ranking.fullMatchIds.length
          ? 'По всичките ' + total + ' предложения си избрал най-честия вот на ' +
            (winners.length === 1 ? 'тази група. Тя получава целия дял от 100%.' : 'тези групи. Те си поделят 100%.')
          : 'Графиката разпределя общо 100% според сходството между твоите отговори и вота на всяка група.'}
          {' '}Избери група за подробности.</p>
        <div className="pr-ledger" aria-live="polite">
          <h3>{selected.shortName}</h3>
          <dl className="pr-vote-counts">
            <div><dt>Съвпадение с най-честия вот на групата</dt><dd>{selected.positionMatchCount} от {answered} гласувания</dd></div>
            <div><dt>Дял от общата близост до всички групи</dt><dd>{selected.share}%</dd></div>
          </dl>
        </div>
        <ShareChart parties={parties} selected={selected} onSelect={setChosenId}/>
      </>}
      {insufficient && <p className="pr-sub">За сравнение са нужни поне {MIN_COMPARISON_ANSWERS} отговора в поне {MIN_COMPARISON_AREAS} тематични области. Попълнени отговори — {answered}. Обхванати области — {ranking.topicIds.length}.</p>}
      {ranking.status === 'no-match' && <p className="pr-sub">По избраните от теб предложения нито един участвал депутат от сравнените групи не е гласувал като теб.</p>}
      <button className="pr-edit-votes" type="button" onClick={() => setEditing(true)}>Промени отговорите по гласуванията</button>
      <VoteEvidence answers={answers} parties={parties}/>
      <details className="pr-vote-method"><summary>Как се разпределят процентите?</summary>
        {ranked && <p>За {selected.shortName} средното претеглено сходство с гласовете на депутатите е {percent.format(selected.alignment)}%.</p>}
        <p>За всяко предложение преброяваме депутатите от всяка група, гласували като теб, и делим на всички гласували от същата група. „Въздържам се“ е отделен вот. Пропуснатите въпроси и отсъстващите депутати не участват.</p>
        <p>В сравнението влиза само решение с ясна посока по конкретното предложение. Депутатският вот показва как е гласувала групата. Нейните мотиви може да се различават от твоите. Само запазените стари отговори „по-скоро“ имат половин тежест. Осредняваме първо по тема, после между темите. При еднакво категорични отговори всяка тема тежи еднакво.</p>
        <p>При съвпадение с най-честия вот по всичките {total} предложения групата получава 100%. Ако няколко групи покриват това условие, делят 100% поравно. При равен брой гласове в една група всеки от водещите варианти се зачита.</p>
        <p>В останалите случаи делим средното сходство за всяка група на сбора за всички {parties.length} групи. За класирането използваме точните стойности. При закръгляне разпределяме оставащите цели проценти по най-голям дробен остатък.</p>
        <p>Сравнението обхваща гласуванията на 52-рото Народно събрание за периода {snapshotLabel}. ПП и ДБ участват като отделни парламентарни групи.</p>
        {result.election?.sourceUrl && <a href={result.election.sourceUrl} target="_blank" rel="noreferrer">{result.election.label} · ЦИК ↗</a>}
      </details>
      <ProgramEvidence answers={answers}/>
    </>}
  </section>;
}
