import Link from "next/link";
import { PUBLIC_CONTACT, PUBLIC_INFO_PAGES } from "@/lib/public-contact";
import { BrandLogoImg } from "./brand-logo-img";
import { PlovdivFooterSkyline } from "./mobile-footer";
import { DesktopFooterControls } from "./desktop-footer-controls";
import "./desktop-footer.css";

const links = [
  { name: "За нас", path: "/team/" },
  { name: "NewsPodcast", path: "/livepoint/podcast/" },
  { name: PUBLIC_INFO_PAGES.contacts.title, path: PUBLIC_INFO_PAGES.contacts.path },
  { name: PUBLIC_INFO_PAGES.advertising.title, path: PUBLIC_INFO_PAGES.advertising.path },
];

/** Wide-screen editorial signature. The mobile composition is independent. */
export function DesktopFooter() {
  return (
    <div className="np-desktop-footer hidden lg:block">
      <div className="np-container np-desktop-footer-inner">
        <div className="np-desktop-footer-grid">
          <div className="np-desktop-footer-brand">
            <PlovdivFooterSkyline className="np-desktop-footer-skyline" />
            <Link href="/" prefetch={false} className="np-desktop-footer-logo" aria-label="NewsPoint.bg — начало">
              <BrandLogoImg sizes="160px" className="np-brand-logo" fetchPriority="low" />
            </Link>
            <span className="np-desktop-footer-accent" aria-hidden="true" />
            <p className="np-desktop-footer-signature">Защото истината <em>има значение.</em></p>
            <p className="np-desktop-footer-description">Новини от Пловдив, България и света.</p>
          </div>

          <nav className="np-desktop-footer-links" aria-label="За NewsPoint">
            <ul>{links.map((link) => <li key={link.path}><Link href={link.path} prefetch={false}>{link.name}</Link></li>)}</ul>
          </nav>

          <address className="np-desktop-footer-contact">
            <p>{PUBLIC_CONTACT.country}, {PUBLIC_CONTACT.city}<br />{PUBLIC_CONTACT.street}</p>
            <a href={PUBLIC_CONTACT.phoneHref}><span className="np-desktop-footer-contact-caption">Телефон</span><span>{PUBLIC_CONTACT.phone}</span></a>
            <a href={PUBLIC_CONTACT.emailHref}><span className="np-desktop-footer-contact-caption">Имейл</span><span>{PUBLIC_CONTACT.email}</span></a>
          </address>
        </div>

        <div className="np-desktop-footer-bottom">
          <p>© {new Date().getFullYear()} NewsPoint.bg</p>
          <div>
            <Link href="/livepoint/report/" prefetch={false} className="np-desktop-footer-report">
              Подай сигнал
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
            </Link>
            <Link href="/settings/" prefetch={false}>Настройки</Link><DesktopFooterControls />
          </div>
        </div>
      </div>
    </div>
  );
}
