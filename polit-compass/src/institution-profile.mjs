import { institutionQuestions } from '../data/institution-questions.mjs';

const formNames = { monarchy: 'Монархия', republic: 'Република' };
const descriptors = { monarchy: 'монархист', republic: 'републиканец' };

const powerReadings = {
  ceremonial: 'Предпочиташ държавният глава да представлява страната, а решенията за управлението да се вземат другаде.',
  arbiter: 'Виждаш държавния глава като арбитър с ограничени правомощия при спор или криза.',
  executive: 'Искаш държавният глава да участва пряко в управлението.',
  collective: 'Предпочиташ отговорността на върха да се споделя от съвет.',
};
const selectionReadings = {
  direct: 'Предпочиташ гражданите да избират държавния глава.',
  parliament: 'Предпочиташ парламентът да избира държавния глава.',
  council: 'Предпочиташ колективен орган начело на държавата.',
  hereditary: 'Предпочиташ наследствен държавен глава.',
};

// Two independent choices are the minimum. Two contradictory signals tied at
// the top never resolve by question order. The denominator includes "either".
function majority(counts) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return Object.keys(counts).find(key => counts[key] >= 2 && counts[key] > total / 2) ?? null;
}

function modelLabel(form, selection, power, cabinetChoice) {
  if (form === 'monarchy') {
    if (power === 'ceremonial' && cabinetChoice === 'majority') return 'Парламентарна монархия';
    if (power === 'ceremonial') return 'Монархия с представителен монарх';
    if (power === 'arbiter') return 'Конституционна монархия с арбитражна роля';
    if (power === 'executive' && cabinetChoice === 'head') return 'Монархия с управляващ монарх';
    if (power === 'executive') return 'Монархия с активен държавен глава';
  }
  if (form === 'republic') {
    if (power === 'collective' && selection === 'council') return 'Република с колективно управление';
    if (power === 'executive' && selection === 'direct' && cabinetChoice === 'head') return 'Президентска република';
    if (power === 'ceremonial' && cabinetChoice === 'majority') return 'Парламентарна република';
    if (power === 'ceremonial') return 'Република с представителен държавен глава';
    if (power === 'arbiter') return 'Република с държавен глава арбитър';
  }
  return formNames[form];
}

export function assessInstitutions(answers = {}) {
  const formCounts = { monarchy: 0, republic: 0, either: 0 };
  const selectionCounts = { hereditary: 0, direct: 0, parliament: 0, council: 0 };
  const powerCounts = { ceremonial: 0, arbiter: 0, executive: 0, collective: 0 };
  let answered = 0;
  for (const question of institutionQuestions) {
    const option = question.options.find(({ value }) => value === answers?.[question.id]);
    if (!option) continue;
    answered++;
    const { form, selection, power } = option.evidence;
    if (form) formCounts[form]++;
    if (selection) selectionCounts[selection]++;
    if (power) powerCounts[power]++;
  }

  const leadingForm = majority(formCounts);
  const form = leadingForm === 'either' ? null : leadingForm;
  const selection = majority(selectionCounts);
  const power = majority(powerCounts);
  const formAnswers = Object.values(formCounts).reduce((sum, count) => sum + count, 0);
  let status, label, description;
  if (form) {
    status = 'leaning';
    label = modelLabel(form, selection, power, answers?.['inst-cabinet']);
    description = form === 'monarchy'
      ? 'В различни ситуации предпочиташ монархията пред републиката.'
      : 'В различни ситуации предпочиташ републиканската форма на управление.';
  } else if (leadingForm === 'either') {
    status = 'open';
    label = 'Отворен избор на държавна форма';
    description = 'Приемаш и монархия, и република според условията.';
  } else if (formAnswers >= 2) {
    status = 'mixed';
    label = 'Смесени предпочитания за държавната форма';
    description = 'Изборът ти между монархия и република зависи от ситуацията.';
  } else {
    status = 'insufficient';
    label = 'Недостатъчно данни за държавната форма';
    description = 'За предпочитана държавна форма трябват поне два отговора по този въпрос.';
  }

  const details = [description];
  if (selection && selection !== 'hereditary') details.push(selectionReadings[selection]);
  if (power && !(power === 'collective' && selection === 'council')) details.push(powerReadings[power]);
  return {
    status, label, descriptor: descriptors[form] ?? null, explanation: details.join(' '),
    answered, form, selection, power, formCounts, selectionCounts, powerCounts,
  };
}
