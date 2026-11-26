// Each option records only its explicit preference about the division of power.
export const territoryQuestions = [
  {
    id: 'territory-authority', topic: 'territory', title: 'Държава и региони',
    prompt: 'Кой да определя правомощията на регионите?',
    options: [
      { value: 'authority-common', model: 'central', label: 'Националният парламент да определя правилата, а регионите да ги изпълняват.' },
      { value: 'authority-delegated', model: 'devolved', label: 'Парламентът да дава широки правомощия на регионите и да може да ги променя със закон.' },
      { value: 'authority-shared', model: 'federal', label: 'Конституцията да запази отделни правомощия за регионите, които централната власт не може сама да отнеме.' },
      { value: 'authority-open', model: 'open', label: 'Мога да приема различни модели, ако е ясно кой за какво отговаря.' },
    ],
  },
  {
    id: 'territory-laws', topic: 'territory', title: 'Държава и региони',
    prompt: 'Два региона искат различни правила за училищата си. Какво предпочиташ?',
    options: [
      { value: 'schools-delegated', model: 'devolved', label: 'Регионите да избират различни правила в рамките на един национален закон.' },
      { value: 'schools-open', model: 'open', label: 'За мен е по-важен достъпът до добро училище. Приемам различни модели.' },
      { value: 'schools-common', model: 'central', label: 'Основните решения и правилата за училищата да се вземат на национално равнище.' },
      { value: 'schools-reserved', model: 'federal', label: 'Всеки регион да приема собствени закони за училищата по право, дадено от конституцията.' },
    ],
  },
  {
    id: 'territory-funding', topic: 'territory', title: 'Държава и региони',
    prompt: 'Как регионите да получават пари за своите решения?',
    options: [
      { value: 'revenue-reserved', model: 'federal', label: 'Конституцията да им гарантира собствени данъчни правомощия, защитени от едностранна промяна.' },
      { value: 'revenue-common', model: 'central', label: 'Държавата да събира данъците и да определя разходите за всеки регион.' },
      { value: 'revenue-open', model: 'open', label: 'Приемам различно разпределение според разходите и възможностите на регионите.' },
      { value: 'revenue-delegated', model: 'devolved', label: 'Националният закон да дава на регионите част от данъците, която те да харчат самостоятелно.' },
    ],
  },
  {
    id: 'territory-transfer', topic: 'territory', title: 'Държава и региони',
    prompt: 'Държавата иска да поеме работа, за която досега отговарят регионите. Кой има последната дума?',
    options: [
      { value: 'transfer-open', model: 'open', label: 'Предпочитам процедурата да зависи от конкретната дейност.' },
      { value: 'transfer-joint', model: 'federal', label: 'За промяна на запазените правомощия да е нужно съгласие и от регионите, и на национално равнище.' },
      { value: 'transfer-delegated', model: 'devolved', label: 'Парламентът да може да промени закона, след като изслуша избраните регионални съвети.' },
      { value: 'transfer-common', model: 'central', label: 'Националната власт да може да прехвърля задачите между своите служби и регионите.' },
    ],
  },
];
