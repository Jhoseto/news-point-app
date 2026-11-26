import { territoryQuestions } from '../data/territory-questions.mjs';

const outcomes = {
  central: {
    label: 'Централизирана унитарна държава',
    descriptor: 'привърженик на централизираното управление',
    explanation: 'Предпочиташ основните правила и ресурси да се определят на национално равнище, а регионите да изпълняват общите решения.',
  },
  devolved: {
    label: 'Унитарна държава с регионално самоуправление',
    descriptor: 'привърженик на регионалното самоуправление',
    explanation: 'Искаш регионите да решават самостоятелно по местни въпроси. Приемаш парламентът да определя обхвата на тези правомощия със закон.',
  },
  federal: {
    label: 'Федерално устройство',
    descriptor: 'федералист',
    explanation: 'Предпочиташ регионите да разполагат със свои правомощия, защитени от конституцията. Националното мнозинство не би могло само да ги отнеме.',
  },
  open: {
    label: 'Гъвкав избор на устройство',
    descriptor: null,
    explanation: 'Приемаш няколко начина за подялба на властта и преценяваш кой е подходящ според конкретната задача.',
  },
  mixed: {
    label: 'Смесено предпочитание за регионите',
    descriptor: null,
    explanation: 'Предпочитанията ти за правилата, парите и правомощията на регионите водят към различни модели.',
  },
  insufficient: {
    label: 'Недостатъчно отговори за регионите',
    descriptor: null,
    explanation: 'За извод за държавното устройство са нужни поне три от четирите избора за регионите.',
  },
};

export function assessTerritory(answers = {}) {
  const votes = { central: 0, devolved: 0, federal: 0, open: 0 };
  let answered = 0;
  for (const question of territoryQuestions) {
    const option = question.options.find(item => item.value === answers[question.id]);
    if (option) { votes[option.model]++; answered++; }
  }
  const consensus = Object.keys(votes).find(model => votes[model] >= 3);
  const status = consensus ?? (answered < 3 ? 'insufficient' : 'mixed');
  return { ...outcomes[status], answered, status };
}
