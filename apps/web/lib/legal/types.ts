export type LegalLink = { label: string; href: string };
export type LegalTable = { caption: string; columns: readonly string[]; rows: readonly (readonly string[])[] };
export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
  table?: LegalTable;
  links?: readonly LegalLink[];
};
export type LegalDocument = {
  key: "terms" | "personalData" | "cookies";
  path: string;
  title: string;
  shortTitle: string;
  description: string;
  lead: string;
  summary: readonly { title: string; text: string }[];
  sections: readonly LegalSection[];
};

/** Publisher-approved edition. Production infrastructure checks are tracked separately in docs/PLAN.md. */
export const LEGAL_EDITION: { version: string; preparedAt: string; status: "review" | "published"; effectiveAt: string | null } = {
  version: "1.2", preparedAt: "2026-10-18", status: "published", effectiveAt: "2026-10-18",
};
export const legalReviewPending = () => LEGAL_EDITION.status !== "published" || !LEGAL_EDITION.effectiveAt;
export const LEGAL_PATHS = { terms: "/privacy-policy/", personalData: "/personal-data-policy/", cookies: "/cookies-policy/" } as const;
export const LEGAL_NAV_LINKS = [
  { label: "Общи условия", href: LEGAL_PATHS.terms },
  { label: "Лични данни", href: LEGAL_PATHS.personalData },
  { label: "Бисквитки", href: LEGAL_PATHS.cookies },
] as const;
export const LEGAL_PUBLISHER = {
  name: "„НЮЗ ПОЙНТ МЕДИА“ ЕООД", eik: "204594050", manager: "Атанас Дончев Доминов",
  address: "България, гр. Пловдив 4004, р-н Южен, ул. „Академик Петър Динеков“ № 15",
  vatRegistered: false, email: "newspointbg@gmail.com", phone: "0893544644",
} as const;
