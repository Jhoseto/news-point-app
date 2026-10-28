import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { studioClientIpOptions } from "./auth-client-ip";
// Exercise the exact installed Better Auth implementation, including its IP normalization.
const require = createRequire(realpathSync(new URL("../node_modules/better-auth/dist/api/index.mjs", import.meta.url)));
const { getIP, createRateLimitKey } = await import(/* @vite-ignore */ pathToFileURL(require.resolve("@better-auth/core/utils/ip")).href);
const options = { advanced: { ipAddress: studioClientIpOptions } };
describe("Studio trusted client identity", () => {
  it("separates two visitors despite Apache's appended proxy address", () => {
    const ips = ["192.0.2.11", "192.0.2.12"].map(ip => getIP(new Headers({ "x-real-ip": ip, "x-forwarded-for": `${ip}, 173.245.48.1` }), options));
    expect(ips).toEqual(["192.0.2.11", "192.0.2.12"]);
    expect(createRateLimitKey(ips[0], "/get-session")).not.toBe(createRateLimitKey(ips[1], "/get-session"));
  });
  it("ignores forged alternate headers and normalizes the trusted IPv6 value", () => {
    const resolved = getIP(new Headers({ "x-real-ip": "2001:db8:abcd:1234::1", "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.8" }), options);
    expect(resolved).toBe("2001:0db8:abcd:1234:0000:0000:0000:0000");
  });
});
