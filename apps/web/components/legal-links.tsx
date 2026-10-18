import Link from "next/link";
import { LEGAL_NAV_LINKS, LEGAL_PATHS } from "@/lib/legal/types";
import "./legal-links.css";
import { CookieSettingsButton } from "./cookie-settings-button";

export function LegalFooterLinks() {
  return <nav className="np-legal-footer-links" aria-label="Правна информация">{LEGAL_NAV_LINKS.map(link => <Link key={link.href} href={link.href} prefetch={false}>{link.label}</Link>)}<CookieSettingsButton className="np-cookie-settings-link" /></nav>;
}

/** Informational notice, never an added blanket GDPR/marketing consent. Safe to include in client forms. */
export function SubmissionLegalNotice({ kind }: { kind: "report" | "my-news" }) {
  return <aside className="np-submission-legal" aria-label="Данни и правила за изпращане">
    <p>{kind === "report" ? "Контактът ви е за проверка и обратна връзка, а не за публично показване. Самият разказ и снимките се оценяват преди публикация." : "Контактът остава за редакцията; избраното име или псевдоним може да представя автора. Изпращането предоставя материала за редакционен преглед."}</p>
    <p><Link href={`${LEGAL_PATHS.personalData}#reports`} prefetch={false} target="_blank" rel="noopener">Как обработваме данните ви<span className="sr-only"> (отваря нов раздел)</span></Link><span aria-hidden="true"> · </span><Link href={`${LEGAL_PATHS.terms}#submissions`} prefetch={false} target="_blank" rel="noopener">Правила за изпращане<span className="sr-only"> (отваря нов раздел)</span></Link></p>
  </aside>;
}
