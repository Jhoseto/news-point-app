import { useState } from 'react';
import { resolveChoice, voteQuestions } from '../data/bg-votes.mjs';

export default function PartyQuestions({ answers, onChange }) {
  const [index, setIndex] = useState(() => Math.max(0, voteQuestions.findIndex(v => answers[v.id] == null)));
  const vote = voteQuestions[index];
  const current = resolveChoice(vote.id, answers[vote.id]);
  function choose(value) {
    onChange(vote.id, value);
    if (index + 1 < voteQuestions.length) setIndex(index + 1);
  }
  return <fieldset className="pc-ballot-edit">
    <legend>Твоят вот · {index + 1} / {voteQuestions.length}</legend>
    <p aria-live="polite">{vote.prompt}</p>
    {current && !current.axis && <p>Записан вот: {current.label}</p>}
    <div className="pc-ballot-picks">{vote.options.map(o =>
      <button key={o.value} type="button" aria-pressed={answers[vote.id] === o.value}
        onClick={() => choose(o.value)}>{o.label}</button>)}</div>
    <nav aria-label="Въпроси за парламентарния вот">
      <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>← Предишен</button>
      <button type="button" onClick={() => choose('abstain')}>Въздържам се по проекта</button>
      <button type="button" onClick={() => choose(null)}>Пропусни</button>
      <button type="button" disabled={index === voteQuestions.length - 1} onClick={() => setIndex(index + 1)}>Следващ →</button>
    </nav>
  </fieldset>;
}
