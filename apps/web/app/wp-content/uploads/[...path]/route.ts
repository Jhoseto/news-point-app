import { legacyMediaDestination } from "@/lib/legacy-media";

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const destination = await legacyMediaDestination(path);
  if (!destination) return new Response(null, { status: 404 });
  const url = new URL(request.url);
  url.pathname = destination;
  url.search = "";
  return new Response(null, { status: 308, headers: { location: `${url.pathname}${url.search}`, "cache-control": "public, max-age=300" } });
}
