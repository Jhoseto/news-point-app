/** A layout hint only; never used for permissions or content visibility. */
export const VIEWPORT_COOKIE = "np-viewport";
export const DESKTOP_QUERY = "(min-width: 64rem)";

export function viewportCookie(desktop: boolean, secure: boolean): string {
  return `${VIEWPORT_COOKIE}=${desktop ? "desktop" : "mobile"}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}
