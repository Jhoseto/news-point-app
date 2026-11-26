// Values are stable answer IDs. An omitted evidence field means the answer says
// nothing about that dimension. Explicit 'either' is a policy preference; a skip
// has no evidence. Only the first four questions express a preference about form.
function choice(value, label, evidence) {
  return { value, label, evidence };
}

const monarchy = { form: 'monarchy', selection: 'hereditary' };
const parliament = { form: 'republic', selection: 'parliament' };
const direct = { form: 'republic', selection: 'direct' };
const council = { form: 'republic', selection: 'council' };
const either = { form: 'either' };

const rows = [
  {
    id: 'inst-founding',
    prompt: 'Нова демократична държава пише конституцията си. Кой да бъде държавен глава?',
    options: [
      choice('parliament', 'Президент, избран от парламента за определен срок.', parliament),
      choice('crown', 'Монарх, който наследява поста по правилата на конституцията.', monarchy),
      choice('council', 'Избран съвет, чиито членове се редуват да представляват страната.', council),
      choice('direct', 'Президент, избран пряко от гражданите.', direct),
      choice('either', 'Бих приел всяка от тези форми, ако властта е ограничена със закон.', either),
    ],
  },
  {
    id: 'inst-succession',
    prompt: 'Монархът се оттегля. На обществено обсъждане се предлагат няколко решения. Кое подкрепяш?',
    options: [
      choice('direct', 'Страната да премине към република с пряк избор на президент.', direct),
      choice('popular-choice', 'И короната, и републиката са приемливи за мен. Нека реши референдум.', either),
      choice('parliament', 'Парламентът да избере президент с ограничен мандат.', parliament),
      choice('succession', 'Наследникът да поеме короната съгласно конституцията.', monarchy),
      choice('council', 'Представителните функции да преминат към избран държавен съвет.', council),
    ],
  },
  {
    id: 'inst-restoration',
    prompt: 'В република се обсъжда връщане на короната. Парламентът ще запази същите си правомощия. Кое предпочиташ?',
    options: [
      choice('restore', 'Да се възстанови наследствената корона.', monarchy),
      choice('republic', 'Държавният глава да продължи да заема поста чрез избор.', { form: 'republic' }),
      choice('conditional-crown', 'Предпочитам короната само ако монархът има изцяло представителна роля.', { ...monarchy, power: 'ceremonial' }),
      choice('ceremonial-president', 'Предпочитам република с президент, който има изцяло представителна роля.', { form: 'republic', power: 'ceremonial' }),
      choice('either', 'И двете решения са приемливи за мен при еднакви права за гражданите.', either),
    ],
  },
  {
    id: 'inst-representation',
    prompt: 'Кой според теб най-добре би представлявал цялата страна при официални посещения и церемонии?',
    options: [
      choice('rotation', 'Член на избран държавен съвет, който се сменя на ротация.', council),
      choice('either', 'За тази роля бих приел и монарх, и избран държавен глава.', either),
      choice('direct', 'Президент с пряк мандат от избирателите.', direct),
      choice('crown', 'Монарх, който олицетворява приемствеността между поколенията.', monarchy),
      choice('parliament', 'Президент, за когото са се споразумели различни партии в парламента.', parliament),
    ],
  },
  {
    id: 'inst-cabinet',
    prompt: 'След изборите кой да има последната дума за състава на правителството?',
    options: [
      choice('majority', 'Парламентарното мнозинство. Държавният глава само оформя назначението.', { power: 'ceremonial' }),
      choice('head', 'Държавният глава сам да избира министрите и да ръководи кабинета.', { power: 'executive' }),
      choice('council', 'Парламентът да избира управленски съвет, който решава колективно.', { power: 'collective' }),
      choice('mediate', 'Държавният глава да предлага премиер след разговори с партиите, а парламентът да гласува.', { power: 'arbiter' }),
    ],
  },
  {
    id: 'inst-law',
    prompt: 'Парламентът приема спорен закон. Каква роля да има държавният глава?',
    options: [
      choice('return', 'Да може да го върне веднъж за повторно обсъждане.', { power: 'arbiter' }),
      choice('sign', 'Да го обнародва. Споровете за закона да се решават от съда.', { power: 'ceremonial' }),
      choice('joint', 'Решението за връщане на закона да се взема с гласуване в държавен съвет.', { power: 'collective' }),
      choice('veto', 'Да може да спре закона, освен ако парламентът го потвърди с голямо мнозинство.', { power: 'executive' }),
    ],
  },
  {
    id: 'inst-crisis',
    prompt: 'При голямо наводнение е нужен общ план за действие. Кой да ръководи работата?',
    options: [
      choice('joint', 'Управленски съвет, чиито членове носят обща отговорност.', { power: 'collective' }),
      choice('mediate', 'Правителството да действа, а държавният глава да събере институциите при спор.', { power: 'arbiter' }),
      choice('lead', 'Държавният глава да ръководи изпълнението и да отговаря за резултата.', { power: 'executive' }),
      choice('represent', 'Премиерът и министрите да действат. Държавният глава да представлява страната.', { power: 'ceremonial' }),
    ],
  },
  {
    id: 'inst-foreign',
    prompt: 'Предстоят важни международни преговори. Кой да определя позицията на страната?',
    options: [
      choice('head', 'Държавният глава като ръководител на външната политика.', { power: 'executive' }),
      choice('cabinet', 'Кабинетът. Държавният глава да изпълнява протоколната роля.', { power: 'ceremonial' }),
      choice('consult', 'Кабинетът след задължителни консултации с държавния глава.', { power: 'arbiter' }),
      choice('joint', 'Избран управленски съвет с общо гласуване.', { power: 'collective' }),
    ],
  },
];

export const institutionQuestions = rows.map(question => ({
  ...question, topic: 'institutions', title: 'Форма на управление',
}));
