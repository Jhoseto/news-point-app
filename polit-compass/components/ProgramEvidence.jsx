import { election, parties, unrepresentedLists } from '../data/bg-party-roster.mjs';
import { programEvidence } from '../data/bg-party-programs.mjs';
import { buildPartyAffinity } from '../src/party-affinity.mjs';

export default function ProgramEvidence({ answers }) {
  const profiles = buildPartyAffinity({ answers, parties, records: programEvidence }).parties;
  return <>{profiles.some(profile => profile.comparisons.length > 0) && <details className="pc-program-evidence">
    <summary>Какво пише в предизборните програми?</summary>
    <p>Тук можеш да сравниш свои отговори с конкретни програмни ангажименти от изборите през април 2026 г. ПП–ДБ се разглежда като обща изборна листа. Процентите по-горе се изчисляват само от гласувания в парламента.</p>
    {profiles.map(({partyId, comparisons, coverage}) => <section key={partyId}>
      <h4>{parties.find(p => p.id === partyId).shortName}</h4>
      {comparisons.length === 0 && <p>{coverage.documented ? 'За документираната позиция липсва твой отговор.' : 'В тази версия няма потвърдено съответствие между програмата и конкретен отговор от теста.'}</p>}
      {comparisons.map(row => <div key={row.questionId}><strong>{row.prompt}</strong>
        <p>Твоят избор: {row.answerLabel}</p>
        <blockquote>„{row.record.quote}“</blockquote>
        <a href={row.record.sourceUrl} target="_blank" rel="noreferrer">{row.record.sourceTitle} ↗</a></div>)}
    </section>)}
  </details>}
  <details className="pc-program-evidence"><summary>Участници в изборите без парламентарен вот</summary>
    <p>Тези листи не получиха мандат на изборите на 19 април 2026 г. За тях няма гласувания в този парламент, от които да изчислим процент.</p>
    <ul>{unrepresentedLists.map(list => <li key={list.ballotNumber}>{list.name}{list.type === 'independent' ? ' · независим кандидат, Смолян' : ''}</li>)}</ul>
    <a href={election.sourceUrl} target="_blank" rel="noreferrer">Официални резултати на ЦИК ↗</a>
  </details></>;
}
