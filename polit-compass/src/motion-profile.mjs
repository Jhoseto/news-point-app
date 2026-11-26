import { voteQuestions } from '../data/bg-votes.mjs';

// Only group proposals when a positive ballot has a common policy meaning. An
// objection to a particular measure does not establish support for its opposite.
const themes = [
  ['cooperation', 'Международни споразумения', 'международните споразумения', [
    'bg-norway-grants-2026', 'bg-eu-uzbekistan',
  ]],
  ['tax', 'Данъчни облекчения', 'данъчните облекчения', [
    'bg-tax-relief-children', 'bg-sports-donations', 'bg-factory-investment', 'bg-food-vat',
  ]],
  ['benefits', 'Пенсии и обезщетения', 'увеличенията на пенсии и обезщетения', [
    'bg-pension-minimum-2026', 'bg-social-insurance-budget-2027',
  ]],
  ['oversight', 'Контрол върху властта', 'мерките за публична отчетност', [
    'bg-budget-disclosure', 'bg-integrity-checks',
  ]],
  ['justice', 'Защита по съдебен ред', 'процесуалните гаранции', [
    'bg-anti-slapp', 'bg-detention-review', 'bg-fuel-manager-review',
  ]],
  ['digital', 'Електронни услуги', 'електронните услуги', [
    'bg-digital-wallet', 'bg-work-permit-portal',
  ]],
  ['paperwork', 'Административни облекчения', 'административните облекчения', [
    'bg-sustainability-reporting', 'bg-vat-threshold', 'bg-danube-irrigation',
  ]],
  ['business', 'Правила за бизнеса', 'новите изисквания към бизнеса', [
    'bg-consumer-credit', 'bg-company-boards', 'bg-gambling-advertising', 'bg-right-to-repair',
  ]],
  ['renewables', 'Възобновяема енергия', 'мерките за възобновяема енергия', [
    'bg-wind-grid-deadline', 'bg-renewable-power-contracts',
  ]],
  ['defence', 'Инвестиции в отбраната', 'инвестициите в отбраната', [
    'bg-air-defence-2026', 'bg-eu-defence-loan',
  ]],
];

const direction = { for: 1, 'lean-for': .5, 'lean-against': -.5, against: -1 };

export function describeMotions(answers) {
  const axes = themes.flatMap(([id, title, phrase, ids]) => {
    const motions = voteQuestions.filter(q => ids.includes(q.id));
    if (motions.length < 2) return [];
    const values = motions.flatMap(q => Object.hasOwn(direction, answers[q.id]) ? [direction[answers[q.id]]] : []);
    const score = values.length < 2 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
    return [{ id, title, phrase, poles: ['По-често против', 'По-често за'], count: values.length,
      total: motions.length, values, score, mixed: values.some(v => v < 0) && values.some(v => v > 0) }];
  });
  const measured = axes.filter(axis => axis.score !== null);
  const strong = measured.filter(axis => Math.abs(axis.score) >= .5)
    .sort((a,b) => Math.abs(b.score) - Math.abs(a.score) || b.count - a.count);
  const strongest = strong[0];
  let title = measured.length ? 'Смесени позиции по предложенията' : 'Твоят политически профил';
  if (strongest) {
    title = (strongest.score > 0 ? 'Подкрепа за ' : 'Резерви към ') + strongest.phrase;
    const second = strong[1];
    if (second) {
      const link = Math.sign(strongest.score) === Math.sign(second.score) ? ' и ' : second.score > 0 ? ' и подкрепа за ' : ' и резерви към ';
      title += link + second.phrase;
    }
  }
  return { axes, title };
}
