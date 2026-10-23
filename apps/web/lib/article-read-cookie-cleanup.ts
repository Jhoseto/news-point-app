import type { NextRequest, NextResponse } from "next/server";

const LEGACY_READ_COOKIE = /^np_rd_[0-9a-f-]{36}$/i;
const MAX_LEGACY_READ_COOKIES = 200;

/**
 * The old read counter created one root-path cookie per article. Remove only
 * those exact first-party markers; consent, polls and Studio auth stay intact.
 */
export function clearLegacyArticleReadCookies(response: NextResponse, request: NextRequest): number {
  const names = request.cookies.getAll()
    .map(cookie => cookie.name)
    .filter(name => LEGACY_READ_COOKIE.test(name))
    .slice(0, MAX_LEGACY_READ_COOKIES);

  for (const name of names) {
    response.cookies.set(name, "", {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      maxAge: 0,
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return names.length;
}
