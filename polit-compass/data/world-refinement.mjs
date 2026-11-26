import { topics } from './world-questions.mjs';

// These voluntary, direct positions have a separate namespace from parliamentary motions.
const middles = {
  welfare: 'Подкрепа главно за нуждаещите се', market: 'Смесена икономика',
  custom: 'Общи норми с място за личен избор', liberty: 'Проверки при ясни ограничения',
  local: 'Споделени решения на държавата и общините', voice: 'Представители след допитване до гражданите',
  world: 'Сътрудничество по отделни споразумения', migration: 'Достъп при определени условия',
  green: 'Баланс между природата и растежа', change: 'Реформи на етапи',
};

export const refinementScales = topics.map(({ id: axis, title, poles }) => ({
  id: 'preference-' + axis, axis, title,
  options: [
    { value: -1, label: poles[0] }, { value: -.5, label: 'По-скоро ' + poles[0].toLocaleLowerCase('bg') },
    { value: 0, label: middles[axis] },
    { value: .5, label: 'По-скоро ' + poles[1].toLocaleLowerCase('bg') }, { value: 1, label: poles[1] },
  ],
}));

export const stateForm = {
  id: 'preference-state-form', title: 'Форма на управление',
  options: [
    { value: 'monarchy', label: 'Монархия' }, { value: 'republic', label: 'Република' },
    { value: 'either', label: 'Приемам и двете' },
  ],
};

export const regionalModel = {
  id: 'preference-region', title: 'Власт на регионите',
  options: [
    { value: 'central', label: 'Централизирано управление' },
    { value: 'devolved', label: 'Регионално самоуправление в унитарна държава' },
    { value: 'federal', label: 'Федерация с конституционни правомощия на регионите' },
    { value: 'open', label: 'Предпочитанието ми зависи от условията' },
  ],
};

export const refinements = [...refinementScales, stateForm, regionalModel];
