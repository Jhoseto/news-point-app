import { policyDilemmas } from './policy-choices.mjs';
import { socialVotes } from './bg-extra-social.mjs';
import { externalVotes } from './bg-extra-external.mjs';
import { governanceVotes } from './bg-extra-governance.mjs';

const mayProtocol = 'https://www.parliament.bg/pub/StenD/20260602104133_gv290526.pdf';
const mayVotes = [
  {
    id: 'ns52-20260529-3', topic: 'Вода и обществени услуги', area: 'economy',
    prompt: 'Да се подкрепи ли законопроектът за различни цени на ВиК услугите за домакинствата, бизнеса и социалните обекти?',
    date: '2026-05-29', number: 3, sourceUrl: mayProtocol, sourceTitle: 'НС · 29 май 2026 · гласуване № 3',
    billUrl: 'https://www.parliament.bg/bg/bills/ID/167018',
    groups: { pb: [116,0,0], gerb: [0,0,22], dps: [4,0,0], db: [0,0,13], pp: [0,0,8], vaz: [0,0,11] },
    assemblyTotals: [120,0,54],
  },
  {
    id: 'ns52-20260529-11', topic: 'Правосъдие и отчетност', area: 'governance',
    prompt: 'Да се състои ли антикорупционната комисия от петима души, като парламентът, президентът, двете върховни съдилища и Висшият адвокатски съвет определят по един?',
    date: '2026-05-29', number: 11, sourceUrl: mayProtocol, sourceTitle: 'НС · 29 май 2026 · гласуване № 11 по чл. 7, ал. 1',
    billUrl: 'https://www.parliament.bg/bg/desision/ID/166967',
    groups: { pb: [115,0,0], gerb: [15,0,0], dps: [0,5,0], db: [13,0,1], pp: [4,0,0], vaz: [8,0,0] },
    assemblyTotals: [155,5,1],
  },
];
// Recorded ballots: [for, against, abstained]. The June entry uses the final
// repeat vote on the amendment, not the later vote on the full paragraph.
const springBudgetVotes = [
  {
    id: 'bg-pension-minimum-2026', topic: 'Социална политика', area: 'welfare',
    prompt: 'Да се увеличи ли минималната пенсия за стаж и възраст от 322,37 на 347,51 евро от 1 юли 2026 г.?',
    date: '2026-05-27', number: 7,
    sourceTitle: '52-ро НС · първо гласуване по законопроект № 52-654-01-44',
    sourceUrl: 'https://parliament.bg/pub/StenD/20260527140211_gv270526.pdf',
    billUrl: 'https://www.parliament.bg/bg/plenaryst/ns/55/ID/11130',
    assemblyTotals: [196, 0, 0],
    groups: { pb: [125, 0, 0], gerb: [21, 0, 0], dps: [7, 0, 0], db: [17, 0, 0], pp: [15, 0, 0], vaz: [11, 0, 0] },
  },
  {
    id: 'bg-interim-debt-ceiling-2026', topic: 'Държавни финанси', area: 'economy',
    prompt: 'До приемането на бюджета за 2026 г. да се намалят ли два лимита: новият дълг за дефицита от 3,8 на 2,1 млрд. евро, а общият таван на облигациите от 30,8 на 29,1 млрд. евро?',
    date: '2026-06-18', number: 19,
    sourceTitle: '52-ро НС · окончателно прегласуване на предложението на Асен Василев по § 1',
    sourceUrl: 'https://www.parliament.bg/pub/StenD/20260618162727_gv180626.pdf',
    billUrl: 'https://www.parliament.bg/bg/plenaryst/ns/55/ID/11140',
    assemblyTotals: [32, 138, 16],
    groups: { pb: [1, 117, 1], gerb: [0, 1, 15], dps: [0, 11, 0], db: [18, 0, 0], pp: [13, 0, 0], vaz: [0, 9, 0] },
  },
];

// The two verification links on each row independently tabulate the official individual roll call.
// Triplets are votes for, against and abstaining. They exclude absent and non-voting members.
const september17 = {
  date: '2026-09-17',
  sourceUrl: 'https://www.parliament.bg/pub/StenD/20260917151626_iv170926.csv',
  sourceTitle: 'НС · Поименно гласуване, 17 септември 2026 г. (CSV)',
  transcriptUrl: 'https://www.parliament.bg/bg/plenaryst/ns/55/ID/11171',
};
const septemberDomesticVotes = [
  {
    ...september17, id: 'bg-digital-wallet', number: 7, topic: 'Цифрова самоличност', area: 'governance',
    prompt: 'Да се подкрепи ли законопроектът за държавен цифров портфейл, с който човек да доказва самоличността си, да показва документи и да ползва електронни услуги?',
    billUrl: 'https://www.parliament.bg/pub/plenary_documents/52-653-18-10_.pdf',
    verificationUrls: ['https://plenarno.eu/glasuvania/2535', 'https://www.pol.bg/assembly/52/narodno-sabranie/zasedanie-50-2026-09-17/glasuvane/7-zid-na-zakona-za-elektronnata-identifikatsiya-parvo-glasuvane-vnositel-bozhidar-bozhanov-i-grupa-n-p-preglasuvane'],
    assemblyTotals: [41, 129, 5],
    groups: { pb: [2, 110, 5], gerb: [18, 0, 0], dps: [0, 10, 0], db: [12, 0, 0], pp: [9, 0, 0], vaz: [0, 9, 0] },
  },
  {
    ...september17, id: 'bg-company-boards', number: 11, topic: 'Управление на публичните дружества', area: 'economy',
    prompt: 'Да се задължат ли големите публични дружества да вземат мерки поне 33% от местата в управителните и надзорните им органи общо да са за по-слабо представения пол?',
    billUrl: 'https://dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=245998',
    verificationUrls: ['https://plenarno.eu/glasuvania/2539', 'https://www.pol.bg/assembly/52/narodno-sabranie/zasedanie-50-2026-09-17/glasuvane/11-zid-na-zakona-za-ravnopostavenost-na-zhenite-i-mazhete-vtoro-glasuvane-naimenovanie-paragraf-1-i-2-prehodni-i-zakly'],
    assemblyTotals: [150, 9, 1],
    groups: { pb: [114, 0, 0], gerb: [9, 0, 1], dps: [12, 0, 0], db: [8, 0, 0], pp: [7, 0, 0], vaz: [0, 9, 0] },
  },
  {
    id: 'bg-minimum-wage', date: '2026-09-18', number: 9, topic: 'Минимална заплата', area: 'welfare',
    prompt: 'Да се определя ли минималната заплата след обсъждане със синдикатите и работодателите, като се отчитат разходите за живот, заплатите и производителността?',
    sourceTitle: 'НС · Поименно гласуване, 18 септември 2026 г. (CSV)',
    sourceUrl: 'https://www.parliament.bg/pub/StenD/20260918155942_iv180926.csv',
    transcriptUrl: 'https://www.parliament.bg/bg/plenaryst/ns/55/ID/11172',
    billUrl: 'https://www.parliament.bg/bg/bills/ID/167540',
    verificationUrls: ['https://plenarno.eu/glasuvania/2586', 'https://www.pol.bg/assembly/52/narodno-sabranie/zasedanie-51-2026-09-18/glasuvane/9-zid-na-kodeksa-na-truda-parvo-glasuvane-preglasuvane'],
    assemblyTotals: [119, 45, 7],
    groups: { pb: [119, 0, 0], gerb: [0, 16, 0], dps: [0, 8, 0], db: [0, 3, 7], pp: [0, 10, 0], vaz: [0, 8, 0] },
  },
  {
    id: 'bg-consumer-credit', date: '2026-09-23', number: 12, topic: 'Потребителски кредити', area: 'economy',
    prompt: 'Да се подкрепи ли законопроектът за потребителския кредит, който обхваща и „купи сега, плати по-късно“ и изисква по-строга проверка дали клиентът може да върне заема?',
    sourceTitle: 'НС · Поименно гласуване, 23 септември 2026 г. (CSV)',
    sourceUrl: 'https://www.parliament.bg/pub/StenD/20260923153316_iv230926.csv',
    transcriptUrl: 'https://www.parliament.bg/bg/plenaryst/ns/55/ID/11173',
    billUrl: 'https://www.parliament.bg/bg/bills/ID/167544',
    verificationUrls: ['https://plenarno.eu/glasuvania/2598', 'https://www.pol.bg/assembly/52/narodno-sabranie/zasedanie-52-2026-09-23/glasuvane/12-zakon-za-potrebitelskiya-kredit-parvo-glasuvane'],
    assemblyTotals: [124, 64, 11],
    groups: { pb: [124, 0, 0], gerb: [0, 25, 1], dps: [0, 0, 10], db: [0, 16, 0], pp: [0, 13, 0], vaz: [0, 10, 0] },
  },
];

const internationalAndHealthVotes = [
  {
    id: 'bg-norway-grants-2026', topic: 'Международно сътрудничество', area: 'international',
    prompt: 'Да одобри ли България споразумението с Норвегия за финансиране на проекти у нас по Норвежкия финансов механизъм за 2021–2028 г.?',
    date: '2026-09-09', number: 9,
    sourceTitle: '52-ро НС · Ратификация на споразумението с Норвегия, второ четене',
    sourceUrl: 'https://www.parliament.bg/pub/StenD/20260909152151_gv090926.pdf#page=2',
    billUrl: 'https://www.parliament.bg/bg/laws/ID/167468',
    groups: { pb: [105, 0, 0], gerb: [9, 0, 0], dps: [13, 0, 0], db: [9, 0, 0], pp: [7, 0, 0], vaz: [0, 9, 0] },
    assemblyTotals: [143, 9, 0],
  },
  {
    id: 'bg-air-defence-2026', topic: 'Отбрана', area: 'international',
    prompt: 'Да се одобри ли актуализираният план за закупуване на зенитно-ракетни комплекси за противовъздушната отбрана на България?',
    date: '2026-10-15', number: 12,
    sourceTitle: '52-ро НС · Решение за обновяване на противовъздушната отбрана',
    sourceUrl: 'https://www.parliament.bg/pub/StenD/20261015134407_gv151026.pdf',
    billUrl: 'https://www.parliament.bg/bg/laws/ID/167587',
    groups: { pb: [121, 0, 0], gerb: [23, 0, 0], dps: [12, 0, 0], db: [10, 0, 0], pp: [9, 0, 0], vaz: [0, 7, 0] },
    assemblyTotals: [175, 7, 0],
  },
  {
    id: 'bg-health-fund-budget-2027', topic: 'Здравеопазване', area: 'welfare',
    prompt: 'Подкрепяш ли проекта за бюджет на здравната каса за 2027 г., който предвижда разходи от 5,68 млрд. евро?',
    date: '2026-11-25', number: 12,
    sourceTitle: '52-ро НС · Бюджет на НЗОК за 2027 г., първо четене, прегласуване',
    sourceUrl: 'https://www.parliament.bg/pub/StenD/20261125204248_gv251126.pdf',
    billUrl: 'https://www.parliament.bg/bg/bills/ID/167644',
    groups: { pb: [125, 0, 0], gerb: [0, 5, 20], dps: [0, 17, 0], db: [0, 18, 0], pp: [1, 13, 0], vaz: [0, 7, 0] },
    assemblyTotals: [126, 60, 20],
  },
];

const groupIds = ['pb','gerb','dps','db','pp','vaz'];
export const policyAreas = {
  economy: 'Икономика и финанси',
  welfare: 'Образование, здраве и социална политика',
  governance: 'Права и управление',
  environment: 'Инфраструктура и околна среда',
  international: 'Външна политика и сигурност',
};
const catalogue = [
  ...mayVotes, ...springBudgetVotes, ...septemberDomesticVotes, ...internationalAndHealthVotes,
  ...socialVotes, ...externalVotes, ...governanceVotes,
];
// Rotate subjects so the opening questions sample different areas of policy.
const areaOrder = ['welfare', 'economy', 'governance', 'international', 'environment'];
const sections = areaOrder.map(area => catalogue.filter(vote => vote.area === area));
const longestSection = Math.max(...sections.map(section => section.length));
export const votes = [];
for (let row = 0; row < longestSection; row++) {
  for (const section of sections) if (section[row]) votes.push(section[row]);
}
if (votes.length !== catalogue.length) throw new Error('Unknown policy area in the questionnaire');
const seenIds = new Set(), seenVotes = new Set();
for (const motion of votes) {
  const key = motion.date + '/' + motion.number;
  const counts = groupIds.map(id => motion.groups[id]);
  const reconciled = counts.every(row => Array.isArray(row) && row.length === 3 &&
    row.every(n => Number.isInteger(n) && n >= 0) && row.some(n => n > 0)) &&
    [0,1,2].every(i => counts.reduce((sum,row) => sum + row[i], 0) === motion.assemblyTotals?.[i]);
  if (!reconciled || !/^https:\/\/(?:www\.)?parliament\.bg\//.test(motion.sourceUrl) ||
    !motion.billUrl || !Object.hasOwn(policyAreas, motion.area) || seenVotes.has(key) || seenIds.has(motion.id)) {
    throw new Error('Invalid parliamentary division: ' + key);
  }
  seenIds.add(motion.id);
  seenVotes.add(key);
}
export const ballotOptions = [
  { value: 'for', label: 'За', ballotIndex: 0, weight: 1 },
  { value: 'lean-for', label: 'По-скоро за', ballotIndex: 0, weight: 0.5 },
  { value: 'lean-against', label: 'По-скоро против', ballotIndex: 1, weight: 0.5 },
  { value: 'against', label: 'Против', ballotIndex: 1, weight: 1 },
  { value: 'abstain', label: 'Въздържам се', ballotIndex: 2, weight: 1 },
];
export function resolveChoice(id, value) {
  return policyDilemmas[id]?.options.find(option => option.value === value) ?? ballotOptions.find(option => option.value === value);
}
export const voteQuestions = votes.map(({ id, topic, prompt }, index) => {
  const choices = policyDilemmas[id].options;
  const start = index % choices.length;
  return { id, topic, title: topic, prompt: policyDilemmas[id].prompt, proposal: prompt, options: [...choices.slice(start), ...choices.slice(0,start)], ballot: true };
});
