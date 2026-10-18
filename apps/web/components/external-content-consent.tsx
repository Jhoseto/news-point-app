"use client";

import { CookieSettingsButton } from "./cookie-settings-button";

export function ExternalContentConsent({ title, sourceUrl, id, className = "" }: { title: string; sourceUrl: string; id?: string | undefined; className?: string }) {
  return <div id={id} className={`np-external-consent ${className}`}>
    <strong>{title}</strong>
    <p>За показване тук разрешете „Външно съдържание“. Доставчикът ще получи технически данни от браузъра ви.</p>
    <CookieSettingsButton />
    <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Отвори при източника ↗</a>
  </div>;
}
