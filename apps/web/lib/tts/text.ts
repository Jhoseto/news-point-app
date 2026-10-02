/**
 * Bulgarian-aware text preparation for the Speech Synthesis API.
 *
 * All functions are pure, side-effect free, and have no DOM dependency so
 * they can be unit-tested under Node and reused outside React.
 */

/** Convert an HTML fragment to speech-friendly plain text, keeping paragraph boundaries. */
export function stripHtml(html: string): string {
  if (!html) return "";
  let text = html;

  // Treat block-level closers and <br> as sentence/paragraph breaks.
  text = text.replace(/<\s*\/?\s*br\s*\/?\s*>/gi, ", ");
  text = text.replace(/<\/\s*(p|div|section|article|li|blockquote|h[1-6])\s*>/gi, "\n");
  text = text.replace(/<\s*hr\s*\/?\s*>/gi, "\n");

  // Drop tags but keep their inner text.
  text = text.replace(/<[^>]+>/g, "");

  // Decode the standard set of HTML entities plus numeric references.
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "и")
    .replace(/&lt;/g, "")
    .replace(/&gt;/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCharCode(value) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => {
      const value = parseInt(code, 16);
      return Number.isFinite(value) ? String.fromCharCode(value) : "";
    });

  return text.replace(/\n+$/, "");
}

/** Drop URLs, emails, hashtag/mention tokens, normalise ellipses and whitespace. */
export function preprocessBulgarian(text: string): string {
  if (!text) return "";
  let out = text;

  // URLs (http, https, www).
  out = out.replace(/\bhttps?:\/\/[^\s<>"']+/gi, " ");
  out = out.replace(/\bwww\.[^\s<>"']+/gi, " ");

  // Email addresses.
  out = out.replace(/\b[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}\b/giu, " ");

  // Hashtags and mentions (no leading space, just the marker).
  out = out.replace(/[#@](?=\S)/g, " ");

  // Ellipses become a brief pause marker; Web Speech will turn the
  // surrounding spaces into a natural gap.
  out = out.replace(/\.{3,}/g, ", ");
  out = out.replace(/…/g, ", ");

  // Quotes and parentheses are visual; the voice only needs a pause.
  out = out.replace(/[«»„“”"]/g, " ");
  out = out.replace(/[–—]/g, ", ");
  out = out.replace(/\(([^)]*)\)/g, ", $1, ");
  out = out.replace(/\s*&\s*/g, " и ");

  // Collapse whitespace, including newlines, runs.
  out = out.replace(/\s+/g, " ").trim();

  return out;
}

// ---------------- Numbers in Bulgarian ----------------

const MASCULINE_ONES = [
  "", "един", "два", "три", "четири", "пет",
  "шест", "седем", "осем", "девет",
] as const;

const FEMININE_ONES = [
  "", "една", "две", "три", "четири", "пет",
  "шест", "седем", "осем", "девет",
] as const;

const TEENS = [
  "десет", "единадесет", "дванадесет", "тринадесет", "четиринадесет",
  "петнадесет", "шестнадесет", "седемнадесет", "осемнадесет", "деветнадесет",
] as const;

const TENS = [
  "", "", "двадесет", "тридесет", "четиридесет", "петдесет",
  "шестдесет", "седемдесет", "осемдесет", "деветдесет",
] as const;

const HUNDREDS = [
  "", "сто", "двеста", "триста", "четиристотин", "петстотин",
  "шестстотин", "седемстотин", "осемстотин", "деветстотин",
] as const;

/** A remainder is one grammatical group, so it takes „и“ before it. */
function isSingleChunk(n: number): boolean {
  if (n <= 0) return false;
  if (n < 20) return true;
  if (n < 100) return n % 10 === 0;
  if (n < 1000) return n % 100 === 0;
  if (n < 1_000_000) return n % 1000 === 0 && isSingleChunk(Math.floor(n / 1000));
  if (n < 1_000_000_000) return n % 1_000_000 === 0 && isSingleChunk(Math.floor(n / 1_000_000));
  return n % 1_000_000_000 === 0 && isSingleChunk(Math.floor(n / 1_000_000_000));
}

function under1000(n: number, feminine = false): string {
  if (n <= 0 || n >= 1000) return "";
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds ? HUNDREDS[hundreds]! : "";
  if (!rest) return head;
  let tail: string;
  if (rest < 10) {
    tail = (feminine ? FEMININE_ONES : MASCULINE_ONES)[rest]!;
  } else if (rest < 20) {
    tail = TEENS[rest - 10]!;
  } else {
    const tens = Math.floor(rest / 10);
    const ones = rest % 10;
    tail = ones
      ? `${TENS[tens]} и ${(feminine ? FEMININE_ONES : MASCULINE_ONES)[ones]}`
      : TENS[tens]!;
  }
  if (!head) return tail;
  return isSingleChunk(rest) ? `${head} и ${tail}` : `${head} ${tail}`;
}

function countForm(n: number, one: string, many: string): string {
  return n % 10 === 1 && n % 100 !== 11 ? one : many;
}

function spellPositive(n: number, feminine: boolean): string {
  if (n < 1000) return under1000(n, feminine);
  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    const head = thousands === 1 ? "хиляда" : `${spellPositive(thousands, true)} хиляди`;
    return rest === 0 ? head : joinParts(head, rest, feminine);
  }
  if (n < 1_000_000_000) {
    const millions = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    const head = `${spellPositive(millions, false)} ${countForm(millions, "милион", "милиона")}`;
    return rest === 0 ? head : joinParts(head, rest, feminine);
  }
  if (n < 1_000_000_000_000) {
    const billions = Math.floor(n / 1_000_000_000);
    const rest = n % 1_000_000_000;
    const head = `${spellPositive(billions, false)} ${countForm(billions, "милиард", "милиарда")}`;
    return rest === 0 ? head : joinParts(head, rest, feminine);
  }
  return String(n);
}

function joinParts(head: string, rest: number, feminine: boolean): string {
  const restText = spellPositive(rest, feminine);
  return isSingleChunk(rest) ? `${head} и ${restText}` : `${head} ${restText}`;
}

function bulgarianInteger(n: number, feminine = false): string {
  if (!Number.isFinite(n)) return "";
  const value = Math.trunc(n);
  if (value === 0) return "нула";
  if (value < 0) return `минус ${bulgarianInteger(-value, feminine)}`;
  return spellPositive(value, feminine);
}

const ONES_ORDINAL: Record<string, readonly [string, string, string]> = {
  един: ["първи", "първа", "първо"],
  една: ["първи", "първа", "първо"],
  два: ["втори", "втора", "второ"],
  две: ["втори", "втора", "второ"],
  три: ["трети", "трета", "трето"],
  четири: ["четвърти", "четвърта", "четвърто"],
  пет: ["пети", "пета", "пето"],
  шест: ["шести", "шеста", "шесто"],
  седем: ["седми", "седма", "седмо"],
  осем: ["осми", "осма", "осмо"],
  девет: ["девети", "девета", "девето"],
  сто: ["стотен", "стотна", "стотно"],
  двеста: ["двестотен", "двестотна", "двестотно"],
  триста: ["тристотен", "тристотна", "тристотно"],
  хиляда: ["хиляден", "хилядна", "хилядно"],
  хиляди: ["хиляден", "хилядна", "хилядно"],
  милион: ["милионен", "милионна", "милионно"],
  милиона: ["милионен", "милионна", "милионно"],
  милиард: ["милиарден", "милиардна", "милиардно"],
  милиарда: ["милиарден", "милиардна", "милиардно"],
};

type OrdinalGender = "m" | "f" | "n";

function ordinalToken(word: string, gender: OrdinalGender): string {
  const known = ONES_ORDINAL[word];
  const slot = gender === "f" ? 1 : gender === "n" ? 2 : 0;
  if (known) return known[slot]!;
  if (word.endsWith("десет")) {
    const stem = word.slice(0, -5);
    if (gender === "f") return `${stem}десета`;
    if (gender === "n") return `${stem}десето`;
    return `${stem}десети`;
  }
  if (word.endsWith("стотин")) {
    const stem = word.slice(0, -6);
    if (gender === "f") return `${stem}стотна`;
    if (gender === "n") return `${stem}стотно`;
    return `${stem}стотен`;
  }
  return word;
}

/** Only the last word of a Bulgarian cardinal becomes ordinal: 2024 → „… четвърта“. */
function ordinalPhrase(cardinal: string, gender: OrdinalGender): string {
  const words = cardinal.trim().split(/\s+/);
  const last = words[words.length - 1] ?? "";
  if (last === "хиляди" && words.length >= 2) {
    const prev = words[words.length - 2]!;
    const fused: Record<string, string> = {
      две: "двехилядна",
      два: "двехилядна",
      три: "трихилядна",
      четири: "четирихилядна",
      пет: "петхилядна",
      шест: "шестхилядна",
      седем: "седемхилядна",
      осем: "осемхилядна",
      девет: "деветхилядна",
    };
    const next = fused[prev];
    if (next && gender === "f") {
      words.splice(words.length - 2, 2, next);
      return words.join(" ");
    }
  }
  words[words.length - 1] = ordinalToken(last, gender);
  return words.join(" ");
}

/** Nouns that take a feminine cardinal („две години“, not „два“). */
const FEMININE_AFTER = /^\s+(неделя|понеделник|вторник|сряда|четвъртък|петък|събота|минута|минути|седмица|седмици|маса|секунда|секунди|тон|кола|коли|улица|улици|магистрала|страница|страници|бройка|бройки|брой|тема|теми|дума|думи|държава|държави|община|общини|област|области|хиляда|хиляди|година|години|българка|българия)(?![\p{L}])/u;
const YEAR_WORD = /^\s+година(?![\p{L}])/u;

/**
 * Replace integers with Bulgarian words.
 * A calendar year („2024 година“, „2024 г.“) is ordinal.
 * A short „5 г.“ is age or duration: „пет години“.
 */
export function numbersToBulgarian(text: string): string {
  if (!text) return "";
  return text.replace(
    /(?<![\d])(\d{1,3}(?:[\s\u00a0]\d{3})+|\d+)(\s*г\.)?/g,
    (full: string, raw: string, yearDot: string | undefined, offset: number, source: string) => {
      const compact = raw.replace(/[\s\u00a0]/g, "");
      if (!/^\d+$/.test(compact) || compact.length > 12) return full;
      const value = Number(compact);
      if (!Number.isFinite(value)) return full;
      const after = source.slice(offset + full.length);
      if (value >= 1000 && (yearDot || YEAR_WORD.test(after))) {
        const spoken = ordinalPhrase(bulgarianInteger(value, true), "f");
        return yearDot ? `${spoken} година` : spoken;
      }
      if (yearDot) return `${bulgarianInteger(value, true)} години`;
      return bulgarianInteger(value, FEMININE_AFTER.test(after));
    },
  );
}

/** Expand Bulgarian abbreviations to pronounceable form. */
export function expandAbbreviations(text: string): string {
  if (!text) return "";
  const map: Record<string, string> = {
    "ЕС": "Е С",
    "САЩ": "С А Щ",
    "СССР": "С С С Р",
    "НПО": "Н П О",
    "ООН": "О О Н",
    "НАТО": "Н А Т О",
    "ЕК": "Е К",
    "ЕЦБ": "Е Ц Б",
    "ЕП": "Е П",
    "МВР": "М В Р",
    "НС": "Н С",
    "НСО": "Н С О",
    "КАТ": "К А Т",
    "ЦИК": "Ц И К",
    "БНБ": "Б Н Б",
    "БНТ": "Б Н Т",
    "БТА": "Б Т А",
    "БЧК": "Б Ч К",
    "ДАНС": "Д А Н С",
    "ДК": "Д К",
    "РЗИ": "Р З И",
    "РЗОК": "Р З О К",
    "СЕМ": "С Е М",
    "СЕЦ": "С Е Ц",
    "СПИН": "спин",
    "ГЕРБ": "герб",
    "БСП": "Б С П",
    "ДПС": "Д П С",
    "ПП": "П П",
    "ДБ": "Д Б",
    "ИТН": "И Т Н",
    "ВМРО": "В М Р О",
    "БДЖ": "Б Д Ж",
    "БАН": "Б А Н",
    "НАП": "Н А П",
    "НОИ": "Н О И",
    "НЗОК": "Н З О К",
    "МОН": "М О Н",
    "МО": "М О",
    "МС": "М С",
    "МЗ": "М З",
    "КЕВР": "К Е В Р",
    "КФН": "К Ф Н",
    "КЗК": "К З К",
    "АПИ": "А П И",
    "ДДС": "Д Д С",
    "ЕГН": "Е Г Н",
    "ПИК": "П И К",
    "РПУ": "Р П У",
    "СДВР": "С Д В Р",
    "ОК": "окей",
    "СЗО": "С З О",
    "Шенген": "Шенген",
    "г-н": "господин",
    "г-ца": "госпожица",
    "г-жа": "госпожа",
    "д-р": "доктор",
    "проф.": "професор",
    "доц.": "доцент",
    "акад.": "академик",
    "инж.": "инженер",
    "арх.": "архитект",
    "полк.": "полковник",
    "ген.": "генерал",
    "т.е.": "тоест",
    "т.н.": "така нататък",
    "т.нар.": "така наречения",
    "т.г.": "тази година",
    "м.г.": "миналата година",
    "бр.": "брой",
    "стр.": "страница",
    "с.": "село",
    "гр.": "град",
    "обл.": "област",
    "пл.": "площад",
    "ул.": "улица",
    "бул.": "булевард",
    "кв.": "квартал",
    "№": "номер",
    "млн.": "милиона",
    "млрд.": "милиарда",
    "хил.": "хиляди",
    "т.": "тона",
    "кг.": "килограма",
    "км.": "километра",
    "км/ч": "километра в час",
    "м/с": "метра в секунда",
    "°C": "градуса Целзий",
  };

  let out = text;

  // Apply multi-word abbreviations first (longest match wins).
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[\\s\\p{P}]+)(${escaped})(?=$|[\\s\\p{P}])`, "gu");
    out = out.replace(pattern, (match, prefix: string) => `${prefix}${map[key]}`);
  }

  return out;
}

/** Read money like "2.50" → "два лева и петдесет стотинки". Defensive: bad input returns the raw text. */
export function moneyToSentence(value: string): string {
  const match = /^(\d+)(?:[.,](\d{0,2}))?$/.exec(value.trim());
  if (!match) return value;
  const leva = Number(match[1]);
  const stotinki = match[2] ? Number(match[2].padEnd(2, "0").slice(0, 2)) : 0;
  const levaText = bulgarianInteger(leva, false);
  const levaForm = (() => {
    const lastTwo = leva % 100;
    if (lastTwo === 1) return "лев";
    return "лева";
  })();
  if (stotinki === 0) return `${levaText} ${levaForm}`;
  const stText = bulgarianInteger(stotinki, false);
  const stForm = (() => {
    const lastTwo = stotinki % 100;
    if (lastTwo === 1) return "стотинка";
    return "стотинки";
  })();
  return `${levaText} ${levaForm} и ${stText} ${stForm}`;
}

/** Read a 24-hour time string "10:30" → "десет и тридесет". Defensive: bad input returns the raw text. */
export function timeToSentence(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return value;
  const hoursText = bulgarianInteger(hours, false);
  if (minutes === 0) {
    return hours === 1 ? "един час" : `${hoursText} часа`;
  }
  const minText = bulgarianInteger(minutes, false);
  return `${hoursText} и ${minText}`;
}

const MONTHS = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
] as const;

const DIGIT_WORDS = [
  "нула", "едно", "две", "три", "четири", "пет", "шест", "седем", "осем", "девет",
] as const;

function dayOrdinal(day: number): string {
  return ordinalPhrase(bulgarianInteger(day, false), "m");
}

function yearOrdinal(year: number): string {
  return `${ordinalPhrase(bulgarianInteger(year, true), "f")} година`;
}

/** „8 март 2024 г.“ and „08.03.2024“ → „осми март две хиляди двадесет и четвърта година“. */
function readDates(text: string): string {
  let out = text.replace(
    /(?<![\d])(\d{1,2})[./](\d{1,2})[./](\d{4})(\s*г\.?)?/g,
    (full: string, dayRaw: string, monthRaw: string, yearRaw: string) => {
      const day = Number(dayRaw);
      const month = Number(monthRaw);
      const year = Number(yearRaw);
      if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1000) return full;
      return `${dayOrdinal(day)} ${MONTHS[month - 1]} ${yearOrdinal(year)}`;
    },
  );
  const named = new RegExp(
    `(?<![\\d])(\\d{1,2})(?:\\s*[-–]\\s*(?:ви|ри|ти|ми|ва|ра|та))?\\s+(${MONTHS.join("|")})(?:\\s+(\\d{4})(?:\\s*г\\.?)?)?`,
    "gi",
  );
  out = out.replace(named, (full: string, dayRaw: string, month: string, yearRaw?: string) => {
    const day = Number(dayRaw);
    if (day < 1 || day > 31) return full;
    const spoken = `${dayOrdinal(day)} ${month.toLowerCase()}`;
    if (!yearRaw) return spoken;
    const year = Number(yearRaw);
    if (year < 1000) return spoken;
    return `${spoken} ${yearOrdinal(year)}`;
  });
  return out;
}

function readTimes(text: string): string {
  return text.replace(
    /(?<![\d])(\d{1,2}):(\d{2})(?![\d])(\s*ч(?:аса)?\.?)?/g,
    (full: string, hours: string, minutes: string) => {
      const spoken = timeToSentence(`${Number(hours)}:${minutes}`);
      return spoken.includes(":") ? full : spoken;
    },
  );
}

function euroSentence(value: string): string {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return value;
  const euros = Number(match[1]);
  const cents = match[2] ? Number(match[2].padEnd(2, "0").slice(0, 2)) : 0;
  const euroText = bulgarianInteger(euros, false)
    .replace(/\bедин\b/g, "едно")
    .replace(/\bдва\b/g, "две");
  if (cents === 0) return `${euroText} евро`;
  const centText = bulgarianInteger(cents, false);
  const centForm = cents % 100 === 1 ? "цент" : "цента";
  return `${euroText} евро и ${centText} ${centForm}`;
}

function readMoney(text: string): string {
  return text.replace(
    /(?<![\d])(\d{1,3}(?:[\s\u00a0]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:лв\.?|лева|лев|евро|€|EUR)(?![\p{L}])/giu,
    (full: string, whole: string, frac: string | undefined) => {
      const amount = `${whole.replace(/[\s\u00a0]/g, "")}${frac ? `.${frac.padEnd(2, "0").slice(0, 2)}` : ""}`;
      if (/евро|€|eur/i.test(full)) return euroSentence(amount);
      const spoken = moneyToSentence(amount);
      return spoken === amount ? full : spoken;
    },
  );
}

function readPercents(text: string): string {
  return text.replace(
    /(?<![\d])(\d+)(?:[.,](\d+))?\s*(?:%|процента|процент)(?![\p{L}])/giu,
    (_full: string, whole: string, frac: string | undefined) => {
      const value = Number(whole);
      if (frac) {
        return `${bulgarianInteger(value, false)} цяло и ${bulgarianInteger(Number(frac), false)} процента`;
      }
      return `${bulgarianInteger(value, false)} ${value === 1 ? "процент" : "процента"}`;
    },
  );
}

function readDegrees(text: string): string {
  return text.replace(
    /(?<![\d])([+-]?\d+)\s*°\s*([CС])?/g,
    (_full: string, raw: string, scale: string | undefined) => {
      const value = Number(raw);
      const spoken = value < 0
        ? `минус ${bulgarianInteger(-value, false)}`
        : bulgarianInteger(value, false);
      return scale ? `${spoken} градуса Целзий` : `${spoken} градуса`;
    },
  );
}

function readOrdinalSuffixes(text: string): string {
  return text.replace(
    /(?<![\d])(\d+)\s*[-–]\s*(ви|ри|ти|ми|ва|ра|та|во|ро|то)\b/gi,
    (_full: string, raw: string, suffix: string) => {
      const gender: OrdinalGender = /^(ва|ра|та)$/i.test(suffix) ? "f" : /^(во|ро|то)$/i.test(suffix) ? "n" : "m";
      return ordinalPhrase(bulgarianInteger(Number(raw), gender === "f"), gender);
    },
  );
}

function readRanges(text: string): string {
  return text.replace(
    /(?<![\d])(\d+)\s*[-–—]\s*(\d+)(?![\d])/g,
    (_full: string, from: string, to: string) =>
      `от ${bulgarianInteger(Number(from), false)} до ${bulgarianInteger(Number(to), false)}`,
  );
}

function spellPhone(raw: string): string {
  return raw
    .split(/[\s./-]+/)
    .filter((part) => part.length > 0)
    .map((part) => [...part].map((digit) => DIGIT_WORDS[Number(digit)] ?? digit).join(" "))
    .join(", ");
}

function readPhones(text: string): string {
  return text
    .replace(/(?<![\d])0\d{2,3}(?:[\s./-]?\d{2,4}){2,4}(?![\d])/g, (raw) => spellPhone(raw))
    .replace(/(?<![\d])0\d{6,12}(?![\d])/g, (raw) => spellPhone(raw));
}

function readDecimals(text: string): string {
  return text.replace(
    /(?<![\d])(\d+)[.,](\d+)(?![\d])/g,
    (_full: string, whole: string, frac: string) => {
      const head = bulgarianInteger(Number(whole), false);
      if (frac.length <= 2) return `${head} цяло и ${bulgarianInteger(Number(frac), false)}`;
      const tail = [...frac].map((digit) => DIGIT_WORDS[Number(digit)] ?? digit).join(" ");
      return `${head} цяло ${tail}`;
    },
  );
}

const LATIN_WORDS: Record<string, string> = {
  "COVID-19": "ковид деветнадесет",
  COVID: "ковид",
  GPS: "джи пи ес",
  SMS: "ес ем ес",
  WIFI: "уай фай",
  "WI-FI": "уай фай",
  LED: "лед",
  VIP: "вип",
  DNA: "Д Н А",
  HIV: "Х И В",
  USB: "ю ес би",
  PDF: "пи ди еф",
  BBC: "би би си",
  CNN: "си ен ен",
  FIFA: "фифа",
  UEFA: "уефа",
  OK: "окей",
  AI: "ей ай",
  TV: "ти ви",
  IT: "ай ти",
  QR: "кю ар",
};

const LATIN_LETTERS: Record<string, string> = {
  A: "ей", B: "би", C: "си", D: "ди", E: "и", F: "еф", G: "джи", H: "ейч",
  I: "ай", J: "джей", K: "кей", L: "ел", M: "ем", N: "ен", O: "оу", P: "пи",
  Q: "кю", R: "ар", S: "ес", T: "ти", U: "ю", V: "ви", W: "дабълю", X: "екс",
  Y: "уай", Z: "зед",
};

/** Spell leftover acronyms. Cyrillic tokens are spelled only when they have no vowel, so ordinary words stay intact. */
function spellAcronyms(text: string): string {
  let out = text;
  const keys = Object.keys(LATIN_WORDS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), LATIN_WORDS[key]!);
  }
  out = out.replace(/\b[A-Z]{2,5}\b/g, (token) =>
    [...token].map((letter) => LATIN_LETTERS[letter] ?? letter).join(" "),
  );
  out = out.replace(/(?<![\p{L}])[А-Я]{2,5}(?![\p{L}])/gu, (token) =>
    /[АЕИОУЪЮЯ]/.test(token) ? token : [...token].join(" "),
  );
  return out;
}

function tidySpeech(text: string): string {
  return text
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/([,.;!?])\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rough news-reading pace used to draw the timeline. Not a clock from the synthesizer. */
export function speechDurationMs(text: string, rate = 1): number {
  const chars = Math.max(1, text.replace(/\s+/g, " ").trim().length);
  const safeRate = rate > 0 ? rate : 1;
  return Math.max(700, Math.round((chars / 13.5) * 1000 / safeRate));
}

/** Main entry point — runs the full pipeline. */
export function prepareForSpeech(text: string): string {
  if (!text) return "";
  let out = stripHtml(text);
  out = preprocessBulgarian(out);
  out = expandAbbreviations(out);
  out = out.replace(/№\s*(?=\d)/g, "номер ");
  out = readDates(out);
  out = readTimes(out);
  out = readMoney(out);
  out = readPercents(out);
  out = readDegrees(out);
  out = readOrdinalSuffixes(out);
  out = readPhones(out);
  out = readRanges(out);
  out = readDecimals(out);
  out = numbersToBulgarian(out);
  out = spellAcronyms(out);
  return tidySpeech(out);
}