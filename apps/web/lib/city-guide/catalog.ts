/** Visual navigation only. Entries are concepts, not verified live feeds. */
export type CityTopic = { title: string; detail: string; source?: string };
export type CityCategory = {
  slug: string;
  title: string;
  eyebrow: string;
  lead: string;
  accent: string;
  topics: CityTopic[];
};

export const OUT_TOPICS = [
  "Тази вечер", "Уикенда", "Предстоящи", "Безплатно", "Партита", "Концерти", "DJ и електронна музика",
  "Рап и хип-хоп", "Попфолк, балканска и турска музика", "Музика на живо", "Студентски вечери", "Стендъп",
  "Куизове", "Настолни игри", "Гейминг", "Творчески работилници", "Младежки инициативи", "Доброволчество и обучения",
] as const;

const NIGHT_DETAILS: Record<(typeof OUT_TOPICS)[number], string> = {
  "Тази вечер": "Събитията за днешната дата, когато са потвърдени.",
  "Уикенда": "Планове за петък, събота и неделя.",
  "Предстоящи": "Програмата за следващите дни.",
  "Безплатно": "Събития със свободен вход при потвърдени условия.",
  "Партита": "Клубни вечери и тематични партита.",
  "Концерти": "Концерти на градските сцени.",
  "DJ и електронна музика": "Електронна сцена и DJ програми.",
  "Рап и хип-хоп": "Рап и хип-хоп участия.",
  "Попфолк, балканска и турска музика": "Програми в тези музикални жанрове.",
  "Музика на живо": "Вечери с изпълнения на живо.",
  "Студентски вечери": "Събития за студентската общност.",
  "Стендъп": "Комедийни представления и сцени.",
  "Куизове": "Куиз вечери и отборни игри.",
  "Настолни игри": "Срещи и турнири с настолни игри.",
  "Гейминг": "Игри, общности и турнири.",
  "Творчески работилници": "Практически ателиета и творчески срещи.",
  "Младежки инициативи": "Срещи и инициативи за млади хора.",
  "Доброволчество и обучения": "Възможности за участие и учене.",
};

export const CITY_CATEGORIES: CityCategory[] = [
  {
    slug: "transport", title: "Транспорт и движение", eyebrow: "01 / В движение", accent: "blue",
    lead: "Линии, маршрути и промените по пътя — подредени на едно място.",
    topics: [
      { title: "Градски автобуси", detail: "Линии, спирки, маршрути и разписания.", source: "https://www.plovdiv.bg/item/transport/mass-public-transport/" },
      { title: "Къде е автобусът?", detail: "Местоположение в реално време при потвърден поток." },
      { title: "Затворени улици", detail: "Отклонения, ремонти и временна организация.", source: "https://www.plovdiv.bg/category/transport/" },
      { title: "Влизане в центъра", detail: "Нискоемисионна зона, правила и изключения.", source: "https://www.plovdiv.bg/zona-s-niska-emisia/" },
      { title: "Вело Пловдив", detail: "Велоалеи, инфраструктура и маршрути." },
      { title: "Извън града", detail: "Автогари, железница и летище при надеждни разписания." },
      { title: "Таксита", detail: "Публичен регистър на разрешенията.", source: "https://www.plovdiv.bg/item/transport/taxi-companies/" },
    ],
  },
  {
    slug: "parking", title: "Паркиране", eyebrow: "02 / На място", accent: "cyan",
    lead: "Зони, правила и полезни адреси, когато търсиш къде да спреш.",
    topics: [
      { title: "Синя и зелена зона", detail: "Обхват, тарифи, работно време и изключения.", source: "https://www.plovdiv.bg/sms-parking/" },
      { title: "Паркинги", detail: "Общински оператор и условия; свободни места само при доказан поток.", source: "https://www.plovdiv.bg/administration/municipal-enterprises/op_parking/" },
      { title: "Пропуски и абонаменти", detail: "Заявления и административни стъпки.", source: "https://www.plovdiv.bg/administration/municipal-enterprises/op_parking/form/" },
      { title: "Репатриране", detail: "Правила и контакти.", source: "https://www.plovdiv.bg/administration/municipal-enterprises/op_parking/" },
    ],
  },
  {
    slug: "outages", title: "Аварии и ремонти", eyebrow: "03 / Важно сега", accent: "indigo",
    lead: "Прекъсвания и ремонти с ясно обозначен източник и време на проверка.",
    topics: [
      { title: "Без вода", detail: "Текущи и планирани ВиК аварии.", source: "https://www.vik.bg/bulletin/" },
      { title: "Без ток", detail: "Аварийни и планирани изключвания.", source: "https://www.elyug.bg/Customers/Unscheduled-power-cuts.aspx" },
      { title: "Парно и топла вода", detail: "Прекъсвания на топлоподаването.", source: "https://www.evn.bg/Home/Heating.aspx" },
      { title: "Улични ремонти", detail: "Засегнати улици, ограничения и обходи.", source: "https://www.plovdiv.bg/category/transport/" },
    ],
  },
  {
    slug: "municipality", title: "Община и институции", eyebrow: "04 / Градът решава", accent: "violet",
    lead: "Услуги, решения, обществени процеси и документи без административен лабиринт.",
    topics: [
      { title: "Административни услуги", detail: "Заявления, документи, такси и срокове.", source: "https://www.plovdiv.bg/uslugi/administrative-services/" },
      { title: "Местни данъци и такси", detail: "Срокове и официални канали за плащане.", source: "https://www.plovdiv.bg/item/taxes/" },
      { title: "Общински съвет", detail: "Дневен ред, предложения, решения и материали.", source: "https://plovdiv.bg/obs/" },
      { title: "Обществени обсъждания", detail: "Проекти, становища и крайни срокове.", source: "https://www.plovdiv.bg/announcements/" },
      { title: "Търгове и общински имоти", detail: "Конкурси, наеми и публични регистри.", source: "https://www.plovdiv.bg/announcements/auctions/" },
      { title: "Контакти и приемно време", detail: "Администрации, дирекции и приемни." },
      { title: "Социални услуги", detail: "Подкрепа, условия, адреси и контакти." },
      { title: "Общински жилища", detail: "Ред и документи за кандидатстване.", source: "https://www.plovdiv.bg/uslugi/administrative-services/housingpolicy/" },
      { title: "Работа в общината", detail: "Обяви, конкурси и резултати.", source: "https://www.plovdiv.bg/administration/work-plovdiv-municipality/obyavi/" },
      { title: "Обществени поръчки", detail: "Какво възлага Пловдив и публични разходи." },
      { title: "Бюджет и отчети", detail: "Къде отиват парите — само с проверени числа." },
      { title: "Дарения", detail: "Публичният регистър на даренията.", source: "https://www.plovdiv.bg/wp-content/uploads/darenia/export_donations_2026.html" },
      { title: "Изборна информация", detail: "Секции, срокове и официални канали при избори." },
      { title: "Къде да подам сигнал?", detail: "Правилният контакт или LivePoint според проблема." },
      { title: "Пазарите на Пловдив", detail: "Адреси, работно време и съобщения.", source: "https://www.plovdiv.bg/administration/municipal-enterprises/market/" },
    ],
  },
  {
    slug: "education", title: "Образование и деца", eyebrow: "05 / Всяка следваща стъпка", accent: "blue",
    lead: "Прием, училища, университети и важните срокове за семействата.",
    topics: [
      { title: "Детски градини и ясли", detail: "Прием, свободни места, класирания и правила.", source: "https://dz-priem.plovdiv.bg/vacancies" },
      { title: "Първи клас", detail: "Прием, места, график и класирания.", source: "https://priem.plovdiv.bg/" },
      { title: "Образователен календар", detail: "Ключови срокове и кандидатстване." },
      { title: "Училища и градини", detail: "Каталог с контакти, райони и адреси." },
      { title: "Помощи за родители", detail: "Условия, компенсации и срокове." },
      { title: "Занимания за деца", detail: "Работилници и ваканционни програми." },
      { title: "Университети и студенти", detail: "Специалности, прием, такси, общежития и стипендии." },
      { title: "Работа в образованието", detail: "Свободни позиции в градини и училища.", source: "https://www.plovdiv.bg/item/education/job-vacancies/" },
      { title: "Студентски общности", detail: "Събития, клубове и обучения.", source: "https://uni-plovdiv.bg/events/all/" },
      { title: "Работа за млади хора", detail: "Възможности за първа работа и стажове при надеждни източници." },
    ],
  },
  {
    slug: "environment", title: "Градска среда", eyebrow: "06 / Живият град", accent: "cyan",
    lead: "Въздух, вода, зелени пространства и ежедневната грижа за Пловдив.",
    topics: [
      { title: "Въздухът в Пловдив", detail: "Измервания, станции, тенденции и час на данните.", source: "https://www.plovdiv.bg/item/ecology/air/local-air-monitoring-system/" },
      { title: "Чистота и сметосъбиране", detail: "Графици за почистване и отпадъци.", source: "https://chistota-plovdiv.com/" },
      { title: "Паркове и зелени площи", detail: "Поддръжка, площадки и косене." },
      { title: "Комари и кърлежи", detail: "Планирани обработки по райони и дати." },
      { title: "Нивото на Марица", detail: "Измервания и история при надежден източник." },
      { title: "Къде да изхвърля?", detail: "Пунктове за текстил, техника, батерии и опасни отпадъци.", source: "https://ecomap.plovdiv.bg/special-waste" },
      { title: "Мобилни пунктове", detail: "Календар за опасни отпадъци." },
      { title: "Шум в града", detail: "Измервания и тенденции при наличен поток." },
      { title: "Метеоизмервания", detail: "Допълнителни данни без дублиране на LivePoint." },
      { title: "Дървета и озеленяване", detail: "Разрешения и дейности по поддръжка." },
      { title: "Домашни любимци", detail: "Регистрационни правила и кампании." },
    ],
  },
  {
    slug: "culture", title: "Култура и събития", eyebrow: "07 / На афиша", accent: "indigo",
    lead: "Един афиш за сцените, залите и културния живот на града.",
    topics: [
      { title: "Театър", detail: "Постановки и сцени.", source: "https://tickets.dtp.bg/" },
      { title: "Опера и балет", detail: "Програма и представления.", source: "https://operaplovdiv.bg/bg/site/program" },
      { title: "Концерти", detail: "Музика на живо и големи сцени." },
      { title: "Фестивали", detail: "Градски и независими фестивали." },
      { title: "Изложби", detail: "Галерии и визуални изкуства." },
      { title: "За деца", detail: "Представления и семейни събития." },
      { title: "Литература", detail: "Премиери, четения и срещи." },
      { title: "Читалища и школи", detail: "Програми и творчески работилници.", source: "https://culture.plovdiv.bg/" },
      { title: "Спорт", detail: "Събития, клубове и инициативи." },
    ],
  },
  {
    slug: "adopt", title: "Осинови приятел", eyebrow: "08 / Ново начало", accent: "violet",
    lead: "Животните от общинския приют и пътят към отговорно осиновяване.",
    topics: [
      { title: "Животни за осиновяване", detail: "Профили и снимки само при потвърден актуален статус.", source: "https://dogshelter.plovdiv.bg/dogs-for-adoption" },
      { title: "Как да осиновя?", detail: "Контакти и стъпки от приюта.", source: "https://dogshelter.plovdiv.bg/" },
    ],
  },
  {
    slug: "nightlife", title: "Нощен Пловдив", eyebrow: "09 / След залез", accent: "indigo",
    lead: "Музика, сцени и преживявания вечер — с проверени дати и места, когато афишът е готов.",
    topics: OUT_TOPICS.map(title => ({ title, detail: NIGHT_DETAILS[title] })),
  },
];

export function cityTopicId(index: number) { return `tema-${index + 1}`; }
