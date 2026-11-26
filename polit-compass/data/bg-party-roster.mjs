export const election = {
  date: '2026-04-19',
  label: 'Парламентарни избори на 19 април 2026 г.',
  sourceUrl: 'https://results.cik.bg/pe202604/rezultati/index.html',
};

// Election lists with seats in the national CEC result, in ballot order.
export const parties = [
  { id: 'pp-db', name: 'Коалиция Продължаваме промяната – Демократична България', shortName: 'ПП–ДБ', seats: 37, sourceEntityId: 'ppdb-coalition-2026' },
  { id: 'vazrazhdane', name: 'Възраждане', shortName: 'Възраждане', seats: 12, sourceEntityId: 'vazrazhdane-party' },
  { id: 'gerb-sds', name: 'ГЕРБ-СДС', shortName: 'ГЕРБ-СДС', seats: 39, sourceEntityId: 'gerb-sds-coalition' },
  { id: 'dps', name: 'Движение за права и свободи - ДПС', shortName: 'ДПС', seats: 21, sourceEntityId: 'dps-party' },
  { id: 'progressive-bg', name: 'Прогресивна България', shortName: 'Прогресивна България', seats: 131, sourceEntityId: 'pb-coalition' },
];

// National CEC results (election.sourceUrl), in printed ballot order.
// The independent committee appeared only on the ballot in district 22.
export const unrepresentedLists = [
  { ballotNumber: 1, name: 'ПП Има такъв народ', votes: 23861 },
  { ballotNumber: 2, name: 'Пряка демокрация', votes: 10032 },
  { ballotNumber: 3, name: 'Синя България', votes: 18640 },
  { ballotNumber: 4, name: 'ПП МЕЧ', votes: 104506 },
  { ballotNumber: 5, name: 'БСП – Обединена левица', votes: 97753 },
  { ballotNumber: 6, name: 'ПП Народна партия Истината и само истината', votes: 4392 },
  { ballotNumber: 9, name: 'Моя България', votes: 4358 },
  { ballotNumber: 10, name: 'Движение на непартийните кандидати', votes: 9761 },
  { ballotNumber: 11, name: 'Алианс за права и свободи – АПС', votes: 50759 },
  { ballotNumber: 12, name: 'Антикорупционен блок', votes: 18999 },
  { ballotNumber: 13, name: 'НД Непокорна България', votes: 6221 },
  { ballotNumber: 14, name: 'ПП Величие', votes: 100572 },
  { ballotNumber: 16, name: 'КП Трети март', votes: 1840 },
  { ballotNumber: 18, name: 'ПП Нация', votes: 9804 },
  { ballotNumber: 19, name: 'България може', votes: 17263 },
  { ballotNumber: 20, name: 'Сияние', votes: 93559 },
  { ballotNumber: 22, name: 'Съпротива', votes: 1897 },
  { ballotNumber: 23, name: 'Партия на Зелените', votes: 3027 },
  { ballotNumber: 24, name: 'ПП Глас народен', votes: 4665 },
  { ballotNumber: 25, name: 'ИК Тодор Тодоров Батков', votes: 2093, type: 'independent', district: 22 },
];
