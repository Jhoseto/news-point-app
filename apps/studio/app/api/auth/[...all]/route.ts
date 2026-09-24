import { getAuth } from "@/lib/auth";
import { BASE_PATH } from "@/lib/paths";

export const dynamic = "force-dynamic";

// Better Auth routes on the full path (basePath /admin/api/auth); depending on
// how the request arrives Next may hand it over without the /admin prefix.
function withFullPath(request: Request): Request {
  const url = new URL(request.url);
  if (url.pathname.startsWith(`${BASE_PATH}/`)) return request;
  url.pathname = `${BASE_PATH}${url.pathname}`;
  return new Request(url, request);
}

export function GET(request: Request) {
  return getAuth().handler(withFullPath(request));
}

export function POST(request: Request) {
  return getAuth().handler(withFullPath(request));
}
