"use client";

import { openCookieSettings } from "./cookie-consent-store";

export function CookieSettingsButton({ className }: { className?: string }) {
  return <button type="button" className={className} onClick={openCookieSettings}>Настройки за бисквитки</button>;
}
