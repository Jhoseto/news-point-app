export const programEvidence = [
  {
    // A flat rate by itself does not specify deductions or an exempt threshold.
    partyId: 'progressive-bg', questionId: 'welfare-1', values: [-1, -.5, 0],
    date: '2026-03-19',
    sourceUrl: 'https://progresivnabulgaria.com/api/view/program-pdf#page=21',
    sourceTitle: 'Програма на коалиция „Прогресивна България“, фискална политика, стр. 20',
    quote: 'Запазване на ниски и плоски данъци',
  },
  {
    partyId: 'gerb-sds', questionId: 'welfare-1', values: [-1],
    date: '2026-04-03',
    sourceUrl: 'https://gerb.bg/front/media/files/GERB_Presentation_2026.pdf#page=12',
    sourceTitle: 'ГЕРБ–СДС, „България 2030“, макроикономическа рамка',
    quote: 'Съхраняване на съществуващия данъчен модел.',
  },

  {
    partyId: 'dps',
    questionId: 'welfare-4',
    values: [1],
    sourceUrl: 'https://web.archive.org/web/20260419071956/https://www.dps.bg/izbori-2026/izborna-programa-2026.html',
    sourceTitle: 'Програма за управление на ДПС — социална политика (архив на изборния ден)',
    quote: 'Осигуряване на безплатни ясли и детски градини',
    date: '2026-04-19',
  },
  {
    partyId: 'vazrazhdane',
    questionId: 'welfare-1',
    values: [1],
    sourceUrl: 'https://vazrazhdane.bg/wp-content/uploads/2026/03/bulgaria-1400-natsionalna-doktrina-za-upravlenie-na-vazrazhdane.pdf#page=57',
    sourceTitle: '„България 1400“ — данъчна и приходна политика, доктрина, представена в Благоевград на 28 март',
    quote: 'с прогресивна ставка ще се облагат тези няколко процента от населението с най-високи доходи',
    date: '2026-03-28',
  },
];
