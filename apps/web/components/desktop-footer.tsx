import Link from "next/link";
import { FOOTER_NAV_LINKS } from "@/lib/footer-nav-links";
import { PUBLIC_CONTACT } from "@/lib/public-contact";
import { BrandLogoImg } from "./brand-logo-img";
import { PlovdivFooterSkyline } from "./mobile-footer";
import { DesktopFooterControls } from "./desktop-footer-controls";
import "./desktop-footer.css";

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
            <ul>{FOOTER_NAV_LINKS.map((link) => <li key={link.path}><Link href={link.path} prefetch={false}>{link.name}</Link></li>)}</ul>
          </nav>

          <address className="np-desktop-footer-contact">
            <a href={PUBLIC_CONTACT.phoneHref}><span className="np-desktop-footer-contact-caption">Телефон</span><span>{PUBLIC_CONTACT.phone}</span></a>
            <a href={PUBLIC_CONTACT.emailHref}><span className="np-desktop-footer-contact-caption">Имейл</span><span>{PUBLIC_CONTACT.email}</span></a>
          </address>
        </div>

        <div className="np-desktop-footer-bottom">
          <p>© {new Date().getFullYear()} NewsPoint.bg</p>
          <DesktopFooterControls />
        </div>
      </div>
    </div>
  );
}
