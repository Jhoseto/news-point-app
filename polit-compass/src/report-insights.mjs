import { resolveChoice, voteQuestions } from '../data/bg-votes.mjs';

export function decisionExamples(answers, lead) {
  if (!lead) return { examples: [], difference: null };
  const examples = [];
  for (const { axis, target } of lead.terms) {
    if (axis.direct || Math.abs(axis.score - target) > .5) continue;
    const choices = voteQuestions.map(q => resolveChoice(q.id, answers[q.id]))
      .filter(o => o?.axis === axis.id && Number.isFinite(o.score))
      .sort((a,b) => Math.abs(a.score - target) - Math.abs(b.score - target));
    const best = choices[0];
    if (best && Math.abs(best.score - target) <= .5) examples.push({ topic: axis.title, label: best.label });
    if (examples.length === 2) break;
  }
  const difference = lead.terms.filter(({axis,target}) => Math.abs(axis.score - target) >= .5)
    .sort((a,b) => Math.abs(b.axis.score-b.target) - Math.abs(a.axis.score-a.target))[0] ?? null;
  return { examples, difference };
}

export function commonTopics(pair, labels) {
  return labels.flatMap((topic,i) => {
    const a = pair[0].axes[i], b = pair[1].axes[i];
    return Number.isFinite(a) && Number.isFinite(b) ? [{ ...topic, a, b, gap: Math.abs(a-b) }] : [];
  }).sort((a,b) => a.gap-b.gap);
}
