import { localCompassAllowed } from "./app/polit-compass/access";
import { NextResponse, type NextRequest } from "next/server";

/** Old rubric links used ?cursor=. The first page must not read searchParams or ISR returns 500 under load. */
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/polit-compass" || pathname.startsWith("/polit-compass/")) {
    return localCompassAllowed(request.headers) ? NextResponse.next() : new NextResponse(null, {
      status: 404, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
  // Preserve historical WordPress shortlinks without making the homepage read
  // searchParams or loading database code on ordinary navigation requests.
  if (request.nextUrl.pathname === "/" && request.nextUrl.searchParams.has("p")) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/legacy-article/";
    return NextResponse.rewrite(url);
  }
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
  matcher: ["/((?!_next/|api/|media/|wp-content/|admin/|share/|feed|sitemap).*)"],
};
