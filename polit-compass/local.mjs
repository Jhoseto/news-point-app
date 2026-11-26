import { join } from "node:path";
import { handleApi } from "./server/api.mjs";
import { openLocalBindings } from "./scripts/local-bindings.mjs";
import { openLocalAccess, owner, stateDirectory } from "./scripts/local-access.mjs";
import { createLocalAuth } from "./scripts/local-auth.mjs";

const base = "/polit-compass";
const root = import.meta.dirname;
let services;
async function openServices() {
  const storage = await openLocalBindings(stateDirectory, join(root, "drizzle"));
  const auth = createLocalAuth(openLocalAccess());
  return { auth, env: { ...storage, EDITORIAL_ADMINS: JSON.stringify([owner.id]),
    EDITORIAL_SOURCE_HOSTS: process.env.EDITORIAL_SOURCE_HOSTS, COMPASS_AUTH_PROVIDER: "local",
    COMPASS_SIGN_IN_PATH: base + "/local-login/", COMPASS_SIGN_OUT_PATH: base + "/local-logout/" } };
}

export async function serve(request) {
  const url = new URL(request.url);
  url.host = "localhost:3000";
  const path = url.pathname.slice(base.length).replace(/\/$/, "");
  const read = request.method === "GET" || request.method === "HEAD";
  if ((!read || path === "/local-logout") && (request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.has("origin") && request.headers.get("origin") !== url.origin))) {
    return new Response(null, { status: 403 });
  }
  const login = path === "/local-logout" || path === "/local-login" || path.startsWith("/local-login/");
  if (!login && !path.startsWith("/api/")) return new Response(null, { status: 404 });
  services ??= openServices().catch(error => { services = undefined; throw error; });
  const { auth, env } = await services;
  url.pathname = path;
  const headers = new Headers();
  for (const key of ["origin", "sec-fetch-site", "content-type", "content-length", "if-none-match"]) {
    if (request.headers.has(key)) headers.set(key, request.headers.get(key));
  }
  if (login) headers.set("cookie", request.headers.get("cookie") || "");
  else {
    const identity = auth.identity(request.headers);
    if (identity) {
      headers.set("oai-authenticated-user-id", identity.id);
      headers.set("oai-authenticated-user-email", identity.email);
    }
  }
  const internal = new Request(url, { method: request.method, headers, body: request.body, duplex: "half" });
  return login ? (await auth.handle(internal) ?? new Response(null, { status: 404 })) : handleApi(internal, env);
}
