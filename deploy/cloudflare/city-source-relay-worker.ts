import { citySourceRelay } from "./city-source-relay";

export default {
  async fetch(request: Request, env: { CITY_SOURCE_RELAY_SECRET?: string }) {
    return await citySourceRelay(request, env) ?? new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  },
};
