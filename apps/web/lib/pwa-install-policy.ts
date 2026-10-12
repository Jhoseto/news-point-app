export const INSTALL_DISMISSED_UNTIL = "np-pwa-install-dismissed-until";
export const INSTALL_DISMISS_MS = 30 * 24 * 60 * 60_000;
export const INSTALL_INTEREST_MS = 30_000;

export function installDismissed(value: string | null, now: number): boolean {
  const until = Number(value);
  // Honour the saved expiry even if the device's clock moves back a little.
  return Number.isSafeInteger(until) && until > now;
}

export function installInterest(visibleMs: number, scrolled: number, viewportHeight: number): boolean {
  return visibleMs >= INSTALL_INTEREST_MS && scrolled >= Math.max(200, viewportHeight / 2);
}
