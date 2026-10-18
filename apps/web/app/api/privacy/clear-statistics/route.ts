import { NextResponse, type NextRequest } from "next/server";
import { isArticleReadSameOrigin } from "@/lib/article-read";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };

export function POST(request: NextRequest) {
  if (!isArticleReadSameOrigin({ origin: request.headers.get("origin"), host: request.headers.get("host"), forwardedHost: request.headers.get("x-forwarded-host"), forwardedProto: request.headers.get("x-forwarded-proto"), fetchSite: request.headers.get("sec-fetch-site") })) return new NextResponse(null, { status: 403, headers });
  const response = new NextResponse(null, { status: 204, headers });
  // These markers are HttpOnly, so a browser script cannot remove them. No database access.
  for (const cookie of request.cookies.getAll().filter(cookie => /^np_rd_[0-9a-f-]{36}$/i.test(cookie.name)).slice(0, 100)) {
    response.cookies.set(cookie.name, "", { httpOnly: true, path: "/", sameSite: "lax", maxAge: 0, secure: request.nextUrl.protocol === "https:" });
  }
  return response;
}
