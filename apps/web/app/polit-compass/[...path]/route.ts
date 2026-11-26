import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { localCompassAllowed } from "../access";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  let response: Response;
  if (!localCompassAllowed(request.headers)) {
    response = new Response(null, { status: 404 });
  } else {
    // Load the isolated Node module only for local requests, outside the production bundle.
    const entry = pathToFileURL(resolve(process.cwd(), "../../polit-compass/local.mjs")).href;
    const { serve } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ entry);
    response = await serve(request);
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export { handle as GET, handle as POST };
