"use client";

import { usePathname } from "next/navigation";
import { FOOTER_SOCIAL_LINKS, type SocialNetwork } from "@/lib/footer-social-links";
import { FacebookIcon } from "./icons";
import "./footer-social-links.css";

function SocialIcon({ network }: { network: SocialNetwork }) {
  if (network === "facebook") return <FacebookIcon width={27} height={27} />;
  if (network === "instagram") return <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5.2" /><circle cx="12" cy="12" r="4.1" /><circle cx="17.6" cy="6.5" r="1.1" fill="currentColor" stroke="none" /></svg>;
  if (network === "youtube") return <svg viewBox="0 0 24 24" width="27" height="27" aria-hidden="true"><rect x="1.5" y="4.5" width="21" height="15" rx="4.5" fill="currentColor" /><path d="m10 8.5 6 3.5-6 3.5Z" fill="#fff" /></svg>;
  const note = "M15 3h3c.2 2.3 1.6 3.8 4 4v3a9.3 9.3 0 0 1-4-1.2V16a6.5 6.5 0 1 1-6.5-6.5H13v3.2a3.3 3.3 0 1 0 2 3V3Z";
  return <svg viewBox="0 0 26 26" width="25" height="25" aria-hidden="true"><path d={note} fill="#25f4ee" transform="translate(-.7 .5)" /><path d={note} fill="#fe2c55" transform="translate(.7 -.3)" /><path d={note} fill="currentColor" /></svg>;
}

export function FooterSocialLinks() {
  const pathname = usePathname();
  if (pathname === "/moyat-plovdiv" || pathname.startsWith("/moyat-plovdiv/")) return null;
  return <section className="np-footer-social" aria-label="Социални мрежи">
    <h2>Социални мрежи</h2>
    <ul>{FOOTER_SOCIAL_LINKS.map(profile => {
      const content = <><SocialIcon network={profile.network} /><span className="sr-only">{profile.name}</span></>;
      return <li key={profile.network} data-network={profile.network}>{profile.href
        ? <a className="np-footer-social-item" href={profile.href} target="_blank" rel="noopener noreferrer" title={profile.name} aria-label={`NewsPoint.bg в ${profile.name} (нов раздел)`}>{content}</a>
        : <span className="np-footer-social-item" title={`Връзката към ${profile.name} ще бъде добавена по-късно.`}>{content}</span>}
      </li>;
    })}</ul>
  </section>;
}
