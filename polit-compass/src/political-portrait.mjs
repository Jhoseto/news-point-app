// Bulgarian nouns for the reference traditions used by the questionnaire.
const names = {
  'Социалдемокрация': 'социалдемократ',
  'Демократичен социализъм': 'демократичен социалист',
  'Социален либерализъм': 'социален либерал',
  'Класически либерализъм': 'класически либерал',
  'Либертарианство': 'либертарианец',
  'Християндемокрация': 'християндемократ',
  'Консерватизъм': 'консерватор',
  'Националконсерватизъм': 'националконсерватор',
  'Зелена политика': 'привърженик на зелената политика',
  'Либертарен социализъм': 'либертарен социалист',
  'Центристки реформизъм': 'центрист',
  'Космополитизъм': 'космополит',
  'Аграризъм': 'аграрист',
  'Екосоциализъм': 'екосоциалист',
  'Дирижизъм': 'привърженик на държавно насочвана икономика',
};

const capitalize = word => word[0].toLocaleUpperCase('bg') + word.slice(1);
const minimumAffinity = 72;
const minimumLead = 4;
const directions = {
  welfare: ['лична финансова отговорност', 'широка социална защита'],
  market: ['свободен пазар', 'обществен контрол в икономиката'],
  custom: ['споделени традиции', 'личен избор'],
  liberty: ['превенция и сигурност', 'граждански свободи'],
  local: ['единни национални решения', 'местно самоуправление'],
  voice: ['представително управление', 'пряко гражданско участие'],
  world: ['национална самостоятелност', 'международно сътрудничество'],
  migration: ['по-строги условия за миграция', 'свободно движение'],
  green: ['икономически растеж', 'опазване на природата'],
  change: ['постепенни реформи', 'бързи реформи'],
};

function descriptiveTitle(axes, descriptor) {
  const measured = axes.filter(axis => axis.score !== null);
  if (measured.length !== 10) return null;
  const strongest = measured.filter(axis => Math.abs(axis.score) >= .35)
    .sort((a,b) => Math.abs(b.score) - Math.abs(a.score)).slice(0,2);
  const phrase = strongest.length
    ? strongest.map(axis => directions[axis.id][Number(axis.score > 0)]).join(' и ')
    : measured.some(axis => axis.mixed) ? 'различни приоритети според темата' : 'умерени позиции по основните теми';
  return descriptor ? capitalize(descriptor) + ' · ' + phrase : capitalize(phrase);
}

function portraitTitle(ranked, descriptor, axes) {
  const lead = ranked[0];
  if (!lead || lead.similarity < minimumAffinity) {
    return descriptiveTitle(axes, descriptor) ?? (descriptor ? capitalize(descriptor) + ' · политически профил' : 'Твоята карта на възгледите');
  }
  const peers = ranked.filter(item => lead.similarity - item.similarity < minimumLead);
  if (peers.length === 1) {
    const noun = names[lead.name];
    if (!noun) return lead.name + (descriptor ? ' · ' + descriptor : '');
    if (descriptor && noun.startsWith('привърженик')) return capitalize(descriptor) + ' · ' + lead.name.toLocaleLowerCase('bg');
    return capitalize(noun) + (descriptor ? ' ' + descriptor : '');
  }
  if (peers.length === 2) {
    const pair = peers.map(item => item.name.toLocaleLowerCase('bg')).join(' и ');
    return descriptor ? capitalize(descriptor) + ' между ' + pair : 'Между ' + pair;
  }
  return descriptiveTitle(axes, descriptor) ?? (descriptor ? capitalize(descriptor) + ' със смесен политически профил' : 'Смесен политически профил');
}

// Pair independent preferences. The middle phrase is used only for consistently
// intermediate choices. A near-zero average of opposing answers is described separately.
const lenses = [
  { title: 'Доходи и собственост', dimensions: [
    ['welfare', 'Предпочиташ човек да поема по-голяма част от собствените си разходи.', 'Насочваш обществената помощ главно към хората с по-ниски доходи.', 'Подкрепяш широк достъп до услуги, платени от общия бюджет.', 'За едни разходи избираш лично плащане, а за други — общо финансиране.'],
    ['market', 'За предприятията предпочиташ частна собственост и конкуренция.', 'В управлението на предприятията виждаш място и за частна инициатива, и за обществен контрол.', 'Искаш обществото или работниците да имат по-голяма роля в управлението на предприятията.', 'Предпочитанието ти за обществена или частна собственост зависи от отрасъла.'],
  ] },
  { title: 'Свобода и обществен ред', dimensions: [
    ['custom', 'Държиш законите да отразяват споделените традиции.', 'Приемаш общи норми, с възможност човек да избира друго.', 'Оставяш решенията за личния живот на отделния човек.', 'По някои лични въпроси държиш на традицията, а по други предпочиташ свободен избор.'],
    ['liberty', 'Допускаш по-широки проверки за предотвратяване на рискове.', 'Предпочиташ проверките да се разрешават при определени условия.', 'Искаш строги граници за намесата на властите в личната свобода.', 'Границата, която поставяш пред проверките, зависи от конкретния риск.'],
  ] },
  { title: 'Кой взема решенията', dimensions: [
    ['local', 'Предпочиташ правилата да са общи за цялата страна.', 'Разделяш отговорността между държавата и общините.', 'Даваш повече самостоятелност на общините и местните общности.', 'При някои услуги предпочиташ общи национални правила, при други — местно решение.'],
    ['voice', 'Разчиташ избраните представители да вземат окончателните решения.', 'Искаш гражданите да участват в обсъждането преди представителите им да решат.', 'Държиш гражданите да могат сами да вземат решения чрез гласуване.', 'В едни случаи оставяш решението на представителите, в други искаш пряк граждански вот.'],
  ] },
  { title: 'Природа и промяна', dimensions: [
    ['green', 'При екологичен компромис даваш по-голяма тежест на работните места и растежа.', 'Предпочиташ екологични ограничения с изключения или преходен срок.', 'При конфликт с икономическия растеж даваш предимство на природата.', 'Екологичните ограничения, които приемаш, се различават според конкретния случай.'],
    ['change', 'Искаш реформите да стъпват върху съществуващите правила.', 'Предпочиташ реформите да се въвеждат на етапи.', 'Подкрепяш бърза промяна на действащите правила.', 'За някои реформи предпочиташ постепенни промени, а при други подкрепяш бърз преход.'],
  ] },
  { title: 'Граници и сътрудничество', dimensions: [
    ['world', 'Предпочиташ държавата да запази последната дума в международните спорове.', 'Разчиташ на доброволни споразумения между държавите.', 'Подкрепяш международни правила, които обвързват всички участници.', 'За някои общи проблеми избираш международни решения, а за други държиш на самостоятелността на държавата.'],
    ['migration', 'Искаш по-строги условия за работа, установяване и придобиване на права.', 'Предпочиташ достъпът до права да зависи от ясни условия за пребиваване.', 'Подкрепяш по-лесен достъп до работа и граждански права за хората, които се установяват в страната.', 'Условията, които поставяш пред новодошлите, се различават според конкретното право.'],
  ] },
];

function readLens(lens, axes) {
  const statements = [];
  let emphasis = 0;
  for (const [id, low, middle, high, mixed] of lens.dimensions) {
    const axis = axes.get(id);
    if (!axis || axis.score === null || axis.count < 3) continue;
    const strength = Math.abs(axis.score);
    const nearMiddle = strength < .35;
    const text = nearMiddle ? (axis.mixed ? mixed : middle) : axis.score > 0 ? high : low;
    statements.push(text);
    emphasis += nearMiddle && axis.mixed ? .4 : strength;
  }
  if (statements.length !== lens.dimensions.length) return null;
  return { title: lens.title, text: statements.join(' '), emphasis };
}

export function composePortrait(axes, ranked, institution, territory) {
  const measured = new Map(axes.map(axis => [axis.id, axis]));
  const strands = lenses.map(lens => readLens(lens, measured)).filter(Boolean)
    .sort((a, b) => b.emphasis - a.emphasis).slice(0, 3)
    .map(({title, text}) => ({title, text}));
  // Keep the headline short. Federalism can distinguish a profile even when
  // the person has no preference between a monarch and an elected head.
  const descriptor = institution?.descriptor ?? (territory?.status === 'federal' ? territory.descriptor : null);
  return { title: portraitTitle(ranked, descriptor, axes), strands };
}
