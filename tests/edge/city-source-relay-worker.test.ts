import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { citySourceRelay } from "../../deploy/cloudflare/city-source-relay";

const endpoint = "https://relay.example/city-source-relay/v1";
const secret = "r".repeat(64);

function signedRequest(target: string, accept = "text/html") {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}\n${target}\n${accept}\n\n`).digest("hex");
  return new Request(endpoint, { headers: { "x-np-city-url": target, "x-np-city-accept": accept, "x-np-city-timestamp": timestamp, "x-np-city-signature": signature } });
}

describe("city source relay Worker", () => {
  it("relays the signed Lo/Hi public page with a bounded response", async () => {
    const target = "https://www.lohicraftspace.com/";
    const fetcher = vi.fn(async (input: Request) => {
      expect(input.url).toBe(target);
      return new Response("<main>Lo/Hi</main>", { headers: { "content-type": "text/html; charset=utf-8", etag: '"v1"' } });
    });
    const response = await citySourceRelay(signedRequest(target), { CITY_SOURCE_RELAY_SECRET: secret }, fetcher);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(response?.headers.get("x-np-relay-final-url")).toBe(target);
    expect(await response?.text()).toBe("<main>Lo/Hi</main>");
  });

  it("rejects unsigned requests and every non-allowlisted host", async () => {
    const fetcher = vi.fn();
    const unsigned = await citySourceRelay(new Request(endpoint, { headers: { "x-np-city-url": "https://www.lohicraftspace.com/" } }), { CITY_SOURCE_RELAY_SECRET: secret }, fetcher);
    expect(unsigned?.status).toBe(403);
    const blocked = await citySourceRelay(signedRequest("https://www.plovdiv.bg/sms-parking/"), { CITY_SOURCE_RELAY_SECRET: secret }, fetcher);
    expect(blocked?.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
