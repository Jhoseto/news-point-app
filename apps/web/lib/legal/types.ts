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

/** A review date, never an invented effective date. Publication requires the PLAN readiness checks. */
export const LEGAL_EDITION: { version: string; preparedAt: string; status: "review" | "published"; effectiveAt: string | null } = {
  version: "1.0", preparedAt: "2026-10-18", status: "review", effectiveAt: null,
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

export const LEGAL_SOURCES = [
  { label: "Общ регламент относно защитата на данните — GDPR", href: "https://eur-lex.europa.eu/legal-content/BG/ALL/?uri=CELEX%3A32016R0679" },
  { label: "Закон за защита на личните данни — КЗЛД", href: "https://cpdp.bg/правна-рамка-национална/закон-за-защита-на-личните-данни-2/" },
  { label: "Закон за електронната търговия", href: "https://www.mi.government.bg/file/2026/05/zet_03_02_26.pdf" },
  { label: "Закон за авторското право и сродните му права — Министерство на културата (DOCX)", href: "https://mc.government.bg/wp-content/uploads/2025/08/80518_2383_ZAPSP.docx" },
  { label: "Насоки на ЕКЗД за съгласието", href: "https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en" },
  { label: "ЕКЗД: доклад за банерите за бисквитки", href: "https://www.edpb.europa.eu/system/files/2023-01/edpb_20230118_report_cookie_banner_taskforce_en.pdf" },
] as const satisfies readonly LegalLink[];
