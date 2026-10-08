import type { Metadata } from "next";
import Link from "next/link";
import { ADVERTISING_MAIL_URL, CONTACT_MAP_URL, PUBLIC_CONTACT, PUBLIC_INFO_PAGES } from "@/lib/public-contact";
import { publicPageMetadata } from "@/lib/public-metadata";
import { Breadcrumbs } from "./breadcrumbs";
import { ArrowRightIcon, ExternalIcon } from "./icons";
import { PlovdivFooterSkyline } from "./mobile-footer";
import "./public-info-page.css";

type InfoPage = keyof typeof PUBLIC_INFO_PAGES;

export function publicInfoMetadata(kind: InfoPage): Metadata {
  return publicPageMetadata(kind);
}

/** Server-rendered public information; no forms, embedded map or third-party requests. */
export function PublicInfoPage({ kind }: { kind: InfoPage }) {
  const advertising = kind === "advertising";
  const page = PUBLIC_INFO_PAGES[kind];
  return (
    <div className="np-mobile-info np-container py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs items={[{ name: page.title }]} />
        <header className="np-mobile-info-header relative isolate mt-6 mb-8">
          <PlovdivFooterSkyline />
          <p className="np-mobile-info-kicker text-xs font-bold tracking-widest text-muted">{advertising ? "РЕКЛАМНИ ЗАПИТВАНИЯ" : "РЕДАКЦИЯТА НА NEWSPOINT"}</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{page.title}</h1>
          <p className="np-mobile-info-lead mt-4 max-w-xl text-lg leading-relaxed text-body">{advertising ? "Нека обсъдим вашата идея." : "Историите започват с разговор."}</p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{advertising
            ? "За рекламни запитвания към NewsPoint.bg пишете ни или се обадете."
            : "Свържете се с редакцията на NewsPoint.bg по телефон или имейл."}</p>
        </header>

        <section className="np-mobile-info-card np-card p-5 sm:p-7" aria-labelledby="np-info-contact-title">
          <h2 id="np-info-contact-title" className="text-base font-extrabold text-ink">{advertising ? "Контакт за реклама" : "Как да ни намерите"}</h2>
          <address className="mt-6 space-y-5 not-italic">
            <div><p className="text-xs font-semibold text-muted">Адрес</p><p className="mt-2 text-sm leading-relaxed text-body">{PUBLIC_CONTACT.country}, {PUBLIC_CONTACT.city}<br />{PUBLIC_CONTACT.street}</p></div>
            <div><p className="text-xs font-semibold text-muted">Телефон</p><a href={PUBLIC_CONTACT.phoneHref} className="np-mobile-info-contact-link inline-flex min-h-11 min-w-11 max-w-full items-center text-base font-bold text-ink">{PUBLIC_CONTACT.phone}</a></div>
            <div><p className="text-xs font-semibold text-muted">Имейл</p><a href={advertising ? ADVERTISING_MAIL_URL : PUBLIC_CONTACT.emailHref} className="np-mobile-info-contact-link inline-flex min-h-11 min-w-11 max-w-full items-center text-base font-bold text-ink">{PUBLIC_CONTACT.email}</a></div>
          </address>
          <div className="np-mobile-info-actions mt-6 flex flex-wrap gap-3">
            <a href={advertising ? ADVERTISING_MAIL_URL : PUBLIC_CONTACT.emailHref} className="np-mobile-info-primary np-gradient-bg inline-flex min-h-11 items-center justify-center gap-3 rounded-xl px-5 py-3 text-sm font-bold text-on-accent">{advertising ? "Изпрати запитване" : "Пиши ни"}<ArrowRightIcon width={18} height={18} /></a>
            {!advertising ? <a href={CONTACT_MAP_URL} target="_blank" rel="noopener noreferrer" className="np-mobile-info-map inline-flex min-h-11 items-center justify-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm font-bold text-ink">Отвори адреса в карта<ExternalIcon width={16} height={16} /></a> : null}
          </div>
        </section>

        {!advertising ? <section className="np-mobile-info-note mt-6 rounded-2xl border border-line bg-surface-2 p-5 sm:p-7" aria-labelledby="np-info-report-title">
          <h2 id="np-info-report-title" className="text-base font-extrabold text-ink">Имаш история?</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">Ако искаш да изпратиш сигнал до редакцията, използвай формата на NewsPoint.</p>
          <Link href="/livepoint/report/" prefetch={false} className="mt-3 inline-flex min-h-11 min-w-11 items-center gap-3 text-sm font-bold text-link">Подай сигнал<ArrowRightIcon width={18} height={18} /></Link>
        </section> : null}
      </div>
    </div>
  );
}
