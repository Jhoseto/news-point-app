import { questions, topics } from '../data/world-questions.mjs';
import { assessInstitutions } from './institution-profile.mjs';
import { assessTerritory } from './territory-profile.mjs';
import { composePortrait } from './political-portrait.mjs';
import { resolveChoice, voteQuestions } from '../data/bg-votes.mjs';
import { refinementScales, stateForm, regionalModel } from '../data/world-refinement.mjs';
import { describeMotions } from './motion-profile.mjs';

// Reference positions on the ten questionnaire dimensions, from -1 to 1.
// Omitted dimensions vary within a tradition and do not contribute to its distance.
export const traditions = [
  ['Социалдемокрация', { welfare: 1, market: .25, custom: .45, world: .65, change: -.2 }],
  ['Демократичен социализъм', { welfare: 1, market: 1, liberty: .55, voice: .65, change: .45 }],
  ['Социален либерализъм', { welfare: .5, market: -.25, custom: .85, liberty: .75, migration: .65, world: .55 }],
  ['Класически либерализъм', { welfare: -.45, market: -.85, custom: .55, liberty: .85, migration: .4 }],
  ['Либертарианство', { welfare: -1, market: -1, liberty: 1, local: .8, custom: .8 }],
  ['Християндемокрация', { welfare: .45, market: -.15, custom: -.65, local: .55, change: -.65 }],
  ['Консерватизъм', { market: -.5, custom: -.8, liberty: -.35, change: -.9, migration: -.35 }],
  ['Националконсерватизъм', { custom: -.85, migration: -.9, world: -.9, liberty: -.45, change: -.55 }],
  ['Зелена политика', { green: 1, voice: .7, local: .55, world: .65, custom: .55 }],
  ['Либертарен социализъм', { market: .95, liberty: 1, local: 1, voice: .9, welfare: .75 }],
  ['Центристки реформизъм', { welfare: 0, market: 0, change: 0, custom: 0, voice: 0 }],
  ['Космополитизъм', { world: 1, migration: 1, custom: .55, liberty: .55 }],
  ['Аграризъм', { local: .95, custom: -.4, green: .55, change: -.5 }],
  ['Екосоциализъм', { market: .9, welfare: .9, green: 1, world: .6, change: .65 }],
  ['Дирижизъм', { market: .9, local: -.85, voice: -.65, world: -.35 }],
].map(([name, positions]) => ({ name, positions }));

export function buildWorldProfile(answers = {}) {
  const selected = voteQuestions.map(q => resolveChoice(q.id, answers[q.id])).filter(Boolean);
  const axes = topics.map(({ id, title, poles }) => {
    const directQuestion = refinementScales.find(q => q.axis === id);
    const direct = directQuestion.options.find(o => o.value === answers[directQuestion.id]);
    const policy = selected.filter(o => o.axis === id && Number.isFinite(o.score));
    const legacy = questions.filter(q => q.topic === id && q.options.some(o => o.value === answers[q.id])).map(q => answers[q.id]);
    const values = direct ? [direct.value] : [...legacy, ...policy.map(o => o.score)];
    const count = values.length;
    const score = direct || count >= 3 ? values.reduce((a, b) => a + b, 0) / count : null;
    return { id, title, poles, score, count, total: direct ? 1 : (policy.length ? voteQuestions.filter(q => q.options[0].axis === id).length + legacy.length : 5), direct: !!direct, values, mixed: values.some(v => v < 0) && values.some(v => v > 0) };
  });
  const measured = axes.filter(axis => axis.score !== null);
  const ranked = measured.length < (selected.some(o => o.axis) ? 5 : topics.length) ? [] : traditions.flatMap(({ name, positions }) => {
    const terms = measured.filter(axis => Object.hasOwn(positions, axis.id)).map(axis => {
      const target = positions[axis.id];
      const squared = axis.values.reduce((sum, value) => sum + (value - target) ** 2, 0) / axis.count;
      return { axis, target, squared };
    }).sort((a, b) => a.squared - b.squared);
    if (terms.length < 3) return [];
    const distance = Math.sqrt(terms.reduce((sum, term) => sum + term.squared, 0) / terms.length);
    return { name, similarity: Math.round(100 * (1 - distance / 2)), terms };
  }).sort((a, b) => b.similarity - a.similarity);
  const institutions = statedModel(answers, stateForm, assessInstitutions(answers), {
    monarchy: 'монархист', republic: 'републиканец',
  });
  const territory = statedModel(answers, regionalModel, assessTerritory(answers), {
    federal: 'федералист',
  });
  const portrait = composePortrait(axes, ranked, institutions, territory);
  const motionProfile = describeMotions(answers);
  const answered = selected.length;
  return { axes, ranked, answered, institutions, territory, portrait, motionProfile };
}

function statedModel(answers, question, previous, descriptors) {
  const option = question.options.find(o => o.value === answers[question.id]);
  if (!option) return previous;
  return { status: option.value, label: option.label, descriptor: descriptors[option.value] ?? null,
    answered: 1, explanation: 'Това е изрично посоченото ти предпочитание.' };
}

