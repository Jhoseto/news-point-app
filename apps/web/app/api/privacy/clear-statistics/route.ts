import { NextResponse, type NextRequest } from "next/server";
import { isArticleReadSameOrigin } from "@/lib/article-read";
import { clearLegacyArticleReadCookies } from "@/lib/article-read-cookie-cleanup";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };

export function POST(request: NextRequest) {
  if (!isArticleReadSameOrigin({ origin: request.headers.get("origin"), host: request.headers.get("host"), forwardedHost: request.headers.get("x-forwarded-host"), forwardedProto: request.headers.get("x-forwarded-proto"), fetchSite: request.headers.get("sec-fetch-site") })) return new NextResponse(null, { status: 403, headers });
  const response = new NextResponse(null, { status: 204, headers });
  // The legacy markers are HttpOnly, so only a server response can expire them.
  clearLegacyArticleReadCookies(response, request);
  return response;
}
