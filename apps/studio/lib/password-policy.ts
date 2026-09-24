// Confirmed by Koce on 24.09.2026: at least 8 characters with a digit, a
// symbol, an upper-case and a lower-case letter. Cyrillic letters count.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const PASSWORD_RULES = [
  { id: "length", label: `Поне ${PASSWORD_MIN} знака`, test: (value: string) => value.length >= PASSWORD_MIN },
  { id: "upper", label: "Голяма буква", test: (value: string) => /\p{Lu}/u.test(value) },
  { id: "lower", label: "Малка буква", test: (value: string) => /\p{Ll}/u.test(value) },
  { id: "digit", label: "Цифра", test: (value: string) => /\p{Nd}/u.test(value) },
  { id: "symbol", label: "Символ (!, @, #, …)", test: (value: string) => /[^\p{L}\p{Nd}\s]/u.test(value) },
] as const;

/** Unmet rules; empty means the password is acceptable. */
export function passwordProblems(value: string): string[] {
  const problems: string[] = PASSWORD_RULES.filter((rule) => !rule.test(value)).map((rule) => rule.label);
  if (value.length > PASSWORD_MAX) problems.push(`Най-много ${PASSWORD_MAX} знака`);
  return problems;
}
