import { describe, expect, it } from "vitest";
import { createECDH } from "node:crypto";
import { isAllowedPushEndpoint, makePushPayload, publicPushOrigin, pushFilterMatches, pushRetry, readerNotificationUrl } from "./push-domain";
import { readPushConfiguration } from "./push-configuration";

describe("reader push contracts", () => {
  it("distinguishes all, none and legacy filters and includes secondary rubrics", () => {
    expect(pushFilterMatches(null, null, null)).toBe(true);
    expect(pushFilterMatches([], "plovdiv", "plovdiv")).toBe(false);
    expect(pushFilterMatches(["region"], null, ["plovdiv", "region"])).toBe(true);
    expect(pushFilterMatches(null, "region", "plovdiv")).toBe(false);
  });
  it.each(["http://fcm.googleapis.com/test", "https://web.push.apple.com.evil.test/test", "https://user@fcm.googleapis.com/test", "https://fcm.googleapis.com:444/test", "https://127.0.0.1/test"])("rejects unsafe provider URL %s", (value) => expect(isAllowedPushEndpoint(value)).toBe(false));
  it.each(["https://fcm.googleapis.com/test", "https://updates.push.services.mozilla.com/test", "https://web.push.apple.com/test", "https://regional.push.apple.com/test"])("accepts provider %s", (value) => expect(isAllowedPushEndpoint(value)).toBe(true));
  it("requires a stable origin and same-origin reader target", () => {
    expect(publicPushOrigin("https://reader.test/")).toBe("https://reader.test");
    expect(publicPushOrigin("http://reader.test/")).toBeNull();
    expect(publicPushOrigin("https://reader.test/subpath/")).toBeNull();
    for (const path of ["https://evil.test/news/", "//evil.test/", "javascript:alert(1)", "/admin/", "/api/private/", "/settings/"]) expect(readerNotificationUrl(path, "https://reader.test")).toBeNull();
    expect(readerNotificationUrl("/real-article/", "https://reader.test")).toBe("https://reader.test/real-article/");
  });
  it("uses one bounded declarative payload for fallback and Apple", () => {
    const payload = makePushPayload("x".repeat(1000), "y".repeat(1000), "https://reader.test/article/", "article-id");
    expect(payload.web_push).toBe(8030);
    expect(payload.notification.title).toHaveLength(160);
    expect(payload.notification.body).toHaveLength(240);
    expect(payload.notification.navigate).toBe("https://reader.test/article/");
    expect(payload.notification.silent).toBe(false);
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(3000);
    expect(makePushPayload("😀".repeat(161), "", "https://reader.test/", "emoji").notification.title).toBe("😀".repeat(160));
  });
  it("honors Retry-After and stops expired/permanent/exhausted retries", () => {
    expect(pushRetry(1, 429, "60", 0, 120000)).toEqual({ kind: "retry", dueAt: 60000 });
    expect(pushRetry(1, 503, new Date(60000).toUTCString(), 0, 120000)).toEqual({ kind: "retry", dueAt: 60000 });
    expect(pushRetry(1, undefined, undefined, 0, 120000)).toEqual({ kind: "retry", dueAt: 5000 });
    expect(pushRetry(1, 410, undefined, 0, 120000)).toEqual({ kind: "gone" });
    expect(pushRetry(1, 403, undefined, 0, 120000)).toEqual({ kind: "failed" });
    expect(pushRetry(6, 503, undefined, 0, 120000)).toEqual({ kind: "failed" });
    expect(pushRetry(1, 429, "120", 0, 120000)).toEqual({ kind: "failed" });
  });
  it("validates the public/private pair rather than just presence", () => {
    const key = createECDH("prime256v1"); key.generateKeys();
    const env = { WEB_URL: "https://reader.test", VAPID_PUBLIC_KEY: key.getPublicKey().toString("base64url"), VAPID_PRIVATE_KEY: key.getPrivateKey().toString("base64url") };
    expect(readPushConfiguration(env)?.origin).toBe("https://reader.test");
    expect(readPushConfiguration({ ...env, VAPID_PRIVATE_KEY: Buffer.alloc(32, 1).toString("base64url") })).toBeNull();
    expect(readPushConfiguration({ ...env, VAPID_SUBJECT: "invalid" })).toBeNull();
  });
});
