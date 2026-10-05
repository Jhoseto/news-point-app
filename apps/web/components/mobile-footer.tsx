import Link from "next/link";
import { PUBLIC_CONTACT, PUBLIC_INFO_PAGES } from "@/lib/public-contact";
import { BrandLogoImg } from "./brand-logo-img";
import { MobileFooterControls } from "./mobile-footer-controls";
import "./mobile-footer.css";

/** Decorative line illustration inspired by Plovdiv's hills, clock tower and theatre. */
export function PlovdivFooterSkyline({ className = "np-mobile-footer-skyline lg:hidden" }: { className?: string } = {}) {
  return (
    <svg className={className} viewBox="0 0 640 150" fill="none" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 132c39 0 49-12 73-14 25-2 32 10 57 7 26-3 37-35 67-37 36-3 48 36 77 33 30-3 37-63 74-69 31-5 45 53 71 58 30 6 39-24 72-20 32 4 48 28 78 31 21 2 43-10 71-8" />
        <path d="M206 115V76h18v39m-21-39h24l-12-10-12 10Zm8-10V54h8v12m-4-12v-9" />
        <circle cx="215" cy="84" r="4" /><path d="M215 81v3l2 1m-6 17h8v13" />
        <path d="M321 83h71m-68 0v21m12-21v16m12-16v12m12-12v12m12-12v15m12-15v20m-72 6c24 11 58 11 86 0m-78 7c26 12 58 12 88 0m-93 7c31 12 70 12 101 0" />
        <path d="M97 123V98h20v26m-22-26 12-9 12 9m-17 8h3m5 0h3m-11 7h3m5 0h3m15 9v-17h13v16m306-2V93h20v29m-23-29 13-10 13 10m-18 8h3m6 0h3m-12 8h3m6 0h3m16 17v-19h19v22" />
        <path d="M0 144h640" opacity=".45" />
      </g>
    </svg>
  );
}

const links = [
  { name: "За нас", path: "/team/" },
  { name: "NewsPodcast", path: "/livepoint/podcast/" },
  { name: PUBLIC_INFO_PAGES.contacts.title, path: PUBLIC_INFO_PAGES.contacts.path },
  { name: PUBLIC_INFO_PAGES.advertising.title, path: PUBLIC_INFO_PAGES.advertising.path },
];

export function MobileFooter() {
  return (
    <div className="np-mobile-footer lg:hidden">
      <div className="np-mobile-footer-inner">
        <div className="np-mobile-footer-brand">
          <PlovdivFooterSkyline />
          <Link href="/" prefetch={false} className="np-mobile-footer-logo" aria-label="NewsPoint.bg — начало">
            <BrandLogoImg sizes="180px" className="np-brand-logo" fetchPriority="low" />
          </Link>
          <span className="np-mobile-footer-accent" aria-hidden="true" />
          <p className="np-mobile-footer-signature">Защото истината<br /><em>има значение.</em></p>
          <p className="np-mobile-footer-description">Новини от Пловдив, България и света.</p>
        </div>

        <Link href="/livepoint/report/" prefetch={false} className="np-mobile-footer-report">
          <span><small>ИМАШ ИСТОРИЯ?</small><strong>Подай сигнал</strong></span>
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
        </Link>

        <nav className="np-mobile-footer-links" aria-label="За NewsPoint">
          {links.map((link) => <Link key={link.path} href={link.path} prefetch={false}>{link.name}<span aria-hidden="true">↗</span></Link>)}
        </nav>

        <address className="np-mobile-footer-contact">
          <span className="np-mobile-footer-label">РЕДАКЦИЯТА</span>
          <p>{PUBLIC_CONTACT.country}, {PUBLIC_CONTACT.city}<br />{PUBLIC_CONTACT.street}</p>
          <a href={PUBLIC_CONTACT.phoneHref}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 3 3 5-2 2a15 15 0 0 0 6 6l2-2 5 3c0 3-2 4-4 4C9 20 4 15 3 7c0-2 1-4 4-4Z" /></svg><span>{PUBLIC_CONTACT.phone}</span></a>
          <a href={PUBLIC_CONTACT.emailHref}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></svg><span>{PUBLIC_CONTACT.email}</span></a>
        </address>

        <div className="np-mobile-footer-bottom">
          <p>© {new Date().getFullYear()} NewsPoint.bg</p>
          <div><Link href="/settings/" prefetch={false}>Настройки</Link><MobileFooterControls /></div>
        </div>
      </div>
    </div>
  );
}
