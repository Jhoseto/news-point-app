// Counts are [for, against, abstained]. For amendments the source title
// identifies the specific proposal voted on, including rejected alternatives.
const parliament = 'https://www.parliament.bg';
const bill = id => parliament + '/bg/bills/ID/' + id;

function sitting(date, id, file) {
  const groupCsv = parliament + '/pub/StenD/' + file;
  return {
    date, groupCsv, sourceUrl: groupCsv,
    sourceTitle: 'Народно събрание · гласуване по парламентарни групи · ' + date.split('-').reverse().join('.'),
    transcriptUrl: parliament + '/bg/plenaryst/ns/55/ID/' + id,
  };
}

const sitting11186 = sitting('2026-10-14', 11186, '20261014143538_gv141026.csv');
const sitting11195 = sitting('2026-11-11', 11195, '20261111144911_gv111126.csv');
const sitting11196 = sitting('2026-11-12', 11196, '20261112145702_gv121126.csv');
const sitting11198 = sitting('2026-11-18', 11198, '20261118161553_gv181126.csv');
const sitting11201 = sitting('2026-11-25', 11201, '20261125204413_gv251126.csv');

export const socialVotes = [
  {
    id: 'bg-first-home-young-families', area: 'welfare', topic: 'Първо жилище',
    prompt: 'Да се насочат ли 87 млн. евро от инвестиционния бюджет на регионалното министерство към помощ за млади семейства, които купуват първото си жилище?',
    date: '2026-07-24', number: 42,
    sourceTitle: '52-ро НС · бюджет за 2026 г., предложение № 52-654-04-89 по чл. 23 · гласуване № 42',
    sourceUrl: 'https://www.parliament.bg/pub/StenD/20260724154948_gv240726.pdf',
    groupCsv: 'https://www.parliament.bg/pub/StenD/20260724155004_gv240726.csv',
    billUrl: 'https://www.parliament.bg/bg/plenaryst/ns/55/ID/11155',
    transcriptUrl: 'https://www.parliament.bg/bg/plenaryst/ns/55/ID/11156',
    assemblyTotals: [15, 12, 183],
    groups: { pb: [1, 9, 114], gerb: [0, 0, 27], dps: [14, 0, 0], db: [0, 2, 19], pp: [0, 0, 12], vaz: [0, 1, 11] },
  },
  {
    id: 'bg-student-scholarships', area: 'welfare', topic: 'Студентски стипендии',
    prompt: 'Само студенти и докторанти в редовна форма на държавно финансирано място ли да могат да кандидатстват за държавна стипендия?',
    date: '2026-09-03', number: 14,
    sourceTitle: '52-ро НС · Закон за висшето образование, второ четене, § 5',
    sourceUrl: 'https://www.parliament.bg/pub/StenD/20260903154207_gv030926.pdf',
    groupCsv: 'https://www.parliament.bg/pub/StenD/20260903154221_gv030926.csv',
    billUrl: 'https://dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=245803',
    transcriptUrl: 'https://www.parliament.bg/bg/plenaryst/ns/55/ID/11165',
    assemblyTotals: [138, 17, 7],
    groups: { pb: [116, 0, 0], gerb: [2, 0, 7], dps: [11, 0, 0], db: [0, 13, 0], pp: [0, 4, 0], vaz: [9, 0, 0] },
  },
  {
    id: 'bg-university-fee-autonomy', area: 'governance', topic: 'Такси за висше образование',
    prompt: 'Да определят ли държавните университети сами годишните такси за платено обучение, без законово определен минимум?',
    date: '2026-09-03', number: 15,
    sourceTitle: '52-ро НС · Закон за висшето образование, второ четене, предложение за промяна на § 6',
    sourceUrl: 'https://www.parliament.bg/pub/StenD/20260903154207_gv030926.pdf',
    groupCsv: 'https://www.parliament.bg/pub/StenD/20260903154221_gv030926.csv',
    billUrl: 'https://www.parliament.bg/bg/bills/ID/167512',
    transcriptUrl: 'https://www.parliament.bg/bg/plenaryst/ns/55/ID/11165',
    assemblyTotals: [11, 120, 34],
    groups: { pb: [1, 106, 11], gerb: [0, 0, 9], dps: [0, 11, 0], db: [0, 0, 14], pp: [0, 3, 0], vaz: [10, 0, 0] },
  },
  {
    ...sitting11186, id: 'bg-medical-expertise', number: 15,
    area: 'welfare', topic: 'Медицинска експертиза',
    prompt: 'Подкрепяш ли проекта здравните данни да се използват за автоматична оценка кои решения на ТЕЛК за трайно намалена работоспособност да бъдат проверени?',
    billUrl: bill(167064),
    assemblyTotals: [172, 0, 0],
    groups: { pb: [122, 0, 0], gerb: [7, 0, 0], dps: [12, 0, 0], db: [15, 0, 0], pp: [10, 0, 0], vaz: [6, 0, 0] },
  },
  {
    ...sitting11195, id: 'bg-tax-relief-children', number: 9,
    area: 'welfare', topic: 'Данъчни облекчения за деца',
    prompt: 'Подкрепяш ли проекта за по-големи данъчни облекчения за семейства с деца и допълнително облекчение при доказани разходи за здраве, образование или спорт на детето?',
    billUrl: bill(167627),
    assemblyTotals: [191, 0, 0],
    groups: { pb: [124, 0, 0], gerb: [18, 0, 0], dps: [15, 0, 0], db: [8, 0, 0], pp: [15, 0, 0], vaz: [11, 0, 0] },
  },
  {
    ...sitting11195, id: 'bg-sports-donations', number: 10,
    area: 'economy', topic: 'Дарения за спорт',
    prompt: 'Подкрепяш ли проекта фирмите да могат да намаляват облагаемата си печалба чрез дарения за спорт, като признатата сума зависи от предназначението на дарението?',
    billUrl: bill(166995),
    assemblyTotals: [7, 39, 135],
    groups: { pb: [6, 0, 119], gerb: [0, 17, 1], dps: [0, 4, 12], db: [1, 0, 1], pp: [0, 8, 2], vaz: [0, 10, 0] },
  },
  {
    ...sitting11195, id: 'bg-factory-investment', number: 11,
    area: 'economy', topic: 'Инвестиции на бизнеса',
    prompt: 'Подкрепяш ли проекта фирмите да могат по-бързо да приспадат от облагаемата си печалба разходите за нови машини и производствено оборудване?',
    billUrl: bill(167541),
    assemblyTotals: [74, 2, 126],
    groups: { pb: [1, 0, 126], gerb: [17, 1, 0], dps: [16, 0, 0], db: [18, 0, 0], pp: [11, 1, 0], vaz: [11, 0, 0] },
  },
  {
    ...sitting11195, id: 'bg-property-valuations', number: 15,
    area: 'economy', topic: 'Данъчна оценка на имотите',
    prompt: 'Подкрепяш ли проекта през 2027–2029 г. поетапно да се повишат базовите стойности, по които общините изчисляват данъчната оценка на имотите?',
    billUrl: bill(167623),
    assemblyTotals: [124, 48, 8],
    groups: { pb: [124, 0, 0], gerb: [0, 18, 0], dps: [0, 12, 0], db: [0, 0, 8], pp: [0, 7, 0], vaz: [0, 11, 0] },
  },
  {
    ...sitting11196, id: 'bg-vat-threshold', number: 7,
    area: 'economy', topic: 'Регистрация по ДДС',
    prompt: 'Подкрепяш ли проекта бизнесът да подлежи на задължителна регистрация по ДДС при по-висок годишен оборот — 84 875 евро?',
    billUrl: bill(166974),
    assemblyTotals: [39, 0, 146],
    groups: { pb: [2, 0, 120], gerb: [0, 0, 14], dps: [0, 0, 12], db: [18, 0, 0], pp: [9, 0, 0], vaz: [10, 0, 0] },
  },
  {
    ...sitting11196, id: 'bg-food-vat', number: 8,
    area: 'economy', topic: 'ДДС върху храните',
    prompt: 'Подкрепяш ли проекта за нулева ставка на ДДС за храните и напитките, включени в малката потребителска кошница на националната статистика?',
    billUrl: bill(167013),
    assemblyTotals: [13, 5, 169],
    groups: { pb: [3, 0, 117], gerb: [0, 3, 15], dps: [0, 0, 14], db: [0, 2, 14], pp: [0, 0, 9], vaz: [10, 0, 0] },
  },
  {
    ...sitting11198, id: 'bg-gambling-advertising', number: 39,
    area: 'welfare', topic: 'Хазартна реклама',
    prompt: 'Подкрепяш ли законопроекта, който забранява хазартните реклами и в социалните мрежи и изисква проверка на самоличността при внасяне на пари в брой през терминал за онлайн залози?',
    billUrl: bill(167536),
    assemblyTotals: [187, 0, 0],
    groups: { pb: [120, 0, 0], gerb: [15, 0, 0], dps: [14, 0, 0], db: [17, 0, 0], pp: [11, 0, 0], vaz: [10, 0, 0] },
  },
  {
    ...sitting11198, id: 'bg-sustainability-reporting', number: 41,
    area: 'economy', topic: 'Отчети на предприятията',
    prompt: 'Подкрепяш ли проекта, който ограничава задължителните отчети за устойчивост до най-големите предприятия, с над 1000 служители и над 450 млн. евро нетни приходи от продажби?',
    billUrl: bill(167625),
    assemblyTotals: [128, 14, 23],
    groups: { pb: [116, 0, 0], gerb: [0, 0, 12], dps: [11, 0, 0], db: [1, 6, 6], pp: [0, 0, 3], vaz: [0, 8, 2] },
  },
  {
    ...sitting11201, id: 'bg-social-insurance-budget-2027', number: 15,
    area: 'welfare', topic: 'Обществено осигуряване',
    prompt: 'Подкрепяш ли проекта за бюджет на общественото осигуряване за 2027 г., който предвижда по-висок таван на пенсиите и по-високи обезщетения за безработица и за втората година майчинство?',
    billUrl: bill(167642),
    assemblyTotals: [123, 46, 32],
    groups: { pb: [123, 0, 0], gerb: [0, 11, 15], dps: [0, 1, 17], db: [0, 14, 0], pp: [0, 12, 0], vaz: [0, 8, 0] },
  },
];
