import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET, POST } from "../../apps/web/app/polit-compass/%5B...path%5D/route.ts";

test("compass routes and their assets are private to the local development site", async () => {
  const request = (suffix, headers = {}) => new Request("http://localhost:3000/polit-compass/" + suffix, {
    headers: { host: "localhost:3000", ...headers }
  });
  process.env.COMPASS_LOCAL_DIR = await mkdtemp(join(tmpdir(), "np-compass-route-"));
  process.chdir(fileURLToPath(new URL("../../apps/web/", import.meta.url)));
  process.env.NODE_ENV = "production";
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
  const save = () => new Request("http://localhost:3000/polit-compass/compare/", {
    method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ key: crypto.randomUUID(), snapshot: { version: 1, axes: Array(10).fill(null), parties: Array(6).fill(null) } }),
  });
  assert.match((await (await POST(save())).json()).code, /^[A-HJ-NP-Z2-9]{6}$/);
  for (const file of ["client.js", "client.css"]) {
    assert.equal((await GET(request("assets/" + file))).status, 404);
  }
});
