import type { Metadata } from "next";
import Link from "next/link";
import { publicMetadata } from "@/lib/public-metadata";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { LEGAL_EDITION, LEGAL_PUBLISHER, legalReviewPending, type LegalDocument, type LegalTable } from "@/lib/legal/types";
import { Breadcrumbs } from "./breadcrumbs";
import { CookieSettingsButton } from "./cookie-settings-button";
import "./legal-page.css";

export function legalMetadata(document: LegalDocument): Metadata {
  return {
    ...publicMetadata({ path: document.path, title: document.title, description: document.description, imagePath: `/share/page/${document.key}/` }),
    // Future draft editions remain excluded; approved pages inherit the deployment's indexing policy.
    ...(legalReviewPending() ? { robots: { index: false, follow: true } } : {}),
  };
}

function DocumentTable({ table }: { table: LegalTable }) {
  return <div className="np-legal-table-wrap"><table className="np-legal-table">
    <caption>{table.caption}</caption>
    <thead><tr>{table.columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
    <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} data-label={table.columns[column]}>{cell}</td>)}</tr>)}</tbody>
  </table></div>;
}

function dateLabel(iso: string) {
  return new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00Z`));
}

/** All document text, anchors and navigation are server rendered; only the cookie-settings opener is interactive. */
export function LegalPage({ document }: { document: LegalDocument }) {
  return <div className="np-legal-page np-container" data-legal-document={document.key}>
    <div className="np-legal-inner">
      <Breadcrumbs items={[{ name: document.shortTitle }]} />
      <header className="np-legal-hero" id="legal-top">
        <div className="np-legal-eyebrow"><span aria-hidden="true" />NEWSPOINT · ПРАВИЛА И ПРОЗРАЧНОСТ</div>
        <div className="np-legal-edition"><span>Версия {LEGAL_EDITION.version}</span><span>Последна актуализация: <time dateTime={LEGAL_EDITION.preparedAt}>{dateLabel(LEGAL_EDITION.preparedAt)}</time></span>{!legalReviewPending() && LEGAL_EDITION.effectiveAt ? <span>В сила от <time dateTime={LEGAL_EDITION.effectiveAt}>{dateLabel(LEGAL_EDITION.effectiveAt)}</time></span> : null}</div>
        <h1>{document.title}</h1>
        <p className="np-legal-lead">{document.lead}</p>
        <nav className="np-legal-documents" aria-label="Правни документи">
          {LEGAL_DOCUMENTS.map(item => <Link key={item.key} href={item.path} prefetch={false} aria-current={item.key === document.key ? "page" : undefined}>{item.shortTitle}<span aria-hidden="true">↗</span></Link>)}
        </nav>
      </header>

      {legalReviewPending() ? <aside className="np-legal-review" aria-label="Статус на документа">
        <span className="np-legal-review-label">Версия за преглед</span>
        <p>Тази редакция е проект и все още не е влязла в сила.</p>
      </aside> : null}

      <div className="np-legal-summary" aria-label="Накратко">
        {document.summary.map((item, index) => <div key={item.title}><span className="np-legal-summary-number" aria-hidden="true">0{index + 1}</span><h2>{item.title}</h2><p>{item.text}</p></div>)}
      </div>

      <div className="np-legal-layout">
        <aside className="np-legal-sidebar">
          <nav aria-label="Съдържание на документа" className="np-legal-toc">
            <p className="np-legal-caption">В този документ</p>
            <ol>{document.sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{section.title}</a></li>)}</ol>
            <a className="np-legal-toc-contact" href={`mailto:${LEGAL_PUBLISHER.email}?subject=${encodeURIComponent("Въпрос за правните документи на NewsPoint.bg")}`}>Въпрос към нас <span aria-hidden="true">↗</span></a>
          </nav>
        </aside>

        <article className="np-legal-document" aria-label={document.title}>
          {document.sections.map((section, index) => <section className="np-legal-section" id={section.id} key={section.id} aria-labelledby={`legal-heading-${section.id}`}>
            <div className="np-legal-section-heading"><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><h2 id={`legal-heading-${section.id}`}>{section.title}<a href={`#${section.id}`} className="np-legal-permalink" aria-label={`Връзка към раздел: ${section.title}`}>#</a></h2></div>
            {section.paragraphs?.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
            {document.key === "cookies" && section.id === "manage" ? <CookieSettingsButton className="np-cookie-settings-link" /> : null}
            {section.items ? <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul> : null}
            {section.table ? <DocumentTable table={section.table} /> : null}
            {section.links ? <ul className="np-legal-links" aria-label="Свързана информация">{section.links.map(link => <li key={link.href}><a href={link.href} rel={link.href.startsWith("https://") ? "noreferrer" : undefined}>{link.label}<span aria-hidden="true">↗</span></a></li>)}</ul> : null}
          </section>)}
          <footer className="np-legal-document-end">
            <p className="np-legal-caption">Издател</p>
            <p>{LEGAL_PUBLISHER.name} · ЕИК {LEGAL_PUBLISHER.eik}</p>
            <a href={`mailto:${LEGAL_PUBLISHER.email}`}>{LEGAL_PUBLISHER.email}</a>
            <a href="#legal-top" className="np-legal-back">Към началото на документа ↑</a>
          </footer>
        </article>
      </div>
    </div>
  </div>;
}
