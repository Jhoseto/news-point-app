import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET } from "../../apps/web/app/polit-compass/%5B...path%5D/route.ts";
import { POST } from "../../apps/web/app/polit-compass/compare/route.ts";
import { proxy } from "../../apps/web/proxy.ts";

test("compass routes and their assets are private to the local development site", async () => {
  const request = (suffix, headers = {}) => new Request("http://localhost:3000/polit-compass/" + suffix, {
    headers: { host: "localhost:3000", ...headers }
  });
  process.env.COMPASS_LOCAL_DIR = await mkdtemp(join(tmpdir(), "np-compass-route-"));
  process.chdir(fileURLToPath(new URL("../../apps/web/", import.meta.url)));
  process.env.NODE_ENV = "production";
  const publicProxy = path => proxy({ nextUrl: new URL(path, "https://newspoint.bg"), headers: new Headers({ host: "newspoint.bg" }) });
  for (const path of ["/polit-compass/", "/polit-compass/compare/", "/polit-compass/news/bg-budget-disclosure/"]) {
    assert.equal(publicProxy(path).headers.get("x-middleware-next"), "1");
  }
  for (const path of ["/polit-compass/local-login/", "/polit-compass/api/admin/session/"]) {
    assert.equal(publicProxy(path).status, 404);
  }
  for (const path of ["", "assets/client.js", "local-login/", "api/admin/session/"]) {
    assert.equal((await GET(request(path))).status, 404);
  }
  process.env.NODE_ENV = "development";
  for (const headers of [{ host: "newspoint.bg" }, { "x-forwarded-host": "public.example" }, { "x-forwarded-for": "192.0.2.1" }]) {
    assert.equal((await GET(request("", headers))).status, 404);
  }
  const response = await GET(request("local-login/"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(await response.text(), /local-login\/session/);
  const save = (origin) => new Request("http://localhost:3000/polit-compass/compare/", {
    method: "POST", headers: { host: "localhost:3000", origin, "content-type": "application/json" },
    body: JSON.stringify({ key: crypto.randomUUID(), snapshot: { version: 1, axes: Array(10).fill(null), parties: Array(6).fill(null) } }),
  });
  assert.equal((await POST(save("https://elsewhere.example"))).status, 403);
  process.env.NODE_ENV = "production";
  assert.equal((await POST(save("http://localhost:3000"))).status, 403);
  const publicRequest = new Request("https://newspoint.bg/polit-compass/compare/", {
    method: "POST", headers: { host: "newspoint.bg", origin: "https://newspoint.bg", "content-type": "application/json" },
    body: JSON.stringify({ codes: [] }),
  });
  assert.equal((await POST(publicRequest)).status, 400);
  process.env.NODE_ENV = "development";
  for (const file of ["client.js", "client.css"]) {
    assert.equal((await GET(request("assets/" + file))).status, 404);
  }
});
