import { NextResponse, type NextRequest } from "next/server";

/** Old rubric links used ?cursor=. The first page must not read searchParams or ISR returns 500 under load. */
export function proxy(request: NextRequest) {
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (!cursor || request.nextUrl.pathname.startsWith("/search")) return NextResponse.next();
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return NextResponse.next();
  const url = request.nextUrl.clone();
  const path = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  url.pathname = `${path}/archive/${cursor}/`;
  url.searchParams.delete("cursor");
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next/|api/|media/|admin/|share/|feed|sitemap).*)"],
};
