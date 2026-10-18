import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { defaultSocial, facebookText, normalizeSocial, socialArticleUrl, socialInput } from "./social-publishing";
import { FacebookClient, FacebookError, facebookPermalink } from "./facebook-api";
import { decryptSocialSecret, encryptSocialSecret, verifyFacebookSignedRequest } from "./social-secrets";

afterEach(() => vi.unstubAllEnvs());
describe("Facebook editorial intent", () => {
  it("uses the exact agreed template, follows titles only until manual editing", () => {
    expect(facebookText("Новина")).toBe("Новина\n\n👇 Четете повече в първия коментар.");
    const initial = defaultSocial("Първо");
    expect(normalizeSocial(initial, "Второ").facebook.text).toBe(facebookText("Второ"));
    const custom = { facebook: { enabled: true, text: "Собствен текст", textMode: "custom" as const } };
    expect(normalizeSocial(custom, "Друго")).toEqual(custom);
    expect(normalizeSocial({ facebook: { ...custom.facebook, enabled: false } }, "Трето").facebook.text).toBe("Собствен текст");
    expect(normalizeSocial({ facebook: { ...custom.facebook, text: "" } }, "Друго").facebook.text).toBe("");
    expect(initial.facebook.enabled).toBe(false);
  });
  it("validates size and rejects extra fields", () => {
    expect(socialInput.safeParse({ facebook: { ...defaultSocial().facebook, text: "x".repeat(60001) } }).success).toBe(false);
    expect(socialInput.safeParse({ ...defaultSocial(), token: "secret" }).success).toBe(false);
  });
  it.each(["https://newspoint.bg", "https://www.newspoint.bg", "https://site44159-izdo3c.scloudsite101.com"])("builds the same canonical article path on %s", origin => {
    expect(socialArticleUrl(origin, "/novina/" )).toBe(`${origin}/novina/`);
  });
  it.each(["http://newspoint.bg", "https://evil.invalid", "https://newspoint.bg.evil.invalid", "http://localhost:3000", "https://user:pass@newspoint.bg"])("rejects unapproved origins: %s", origin => {
    expect(socialArticleUrl(origin, "/novina/")).toBeNull();
  });
  it.each(["//evil.invalid/", "/../foo/", "/draft/123/", "/foo/?x=1"])("rejects unsafe article paths %s", path => {
    expect(socialArticleUrl("https://newspoint.bg", path)).toBeNull();
  });
});
describe("credential storage and Meta callbacks", () => {
  it("encrypts randomly, binds the Page/app context and detects corruption", () => {
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 42).toString("base64"));
    const a = encryptSocialSecret("page-token", "page:1"); const b = encryptSocialSecret("page-token", "page:1");
    expect(a).not.toBe(b); expect(a).not.toContain("page-token");
    expect(decryptSocialSecret(a, "page:1")).toBe("page-token");
    expect(() => decryptSocialSecret(a, "page:2")).toThrow("social_secret_unavailable");
    expect(() => decryptSocialSecret(a.replace("v1", "v2"), "page:1")).toThrow();
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 43).toString("base64"));
    expect(() => decryptSocialSecret(a, "page:1")).toThrow();
  });
  it("refuses unconfigured encryption", () => {
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", ""); expect(() => encryptSocialSecret("token", "page")).toThrow("social_key_unavailable");
  });
  it("verifies signed deauthorization/deletion callbacks and rejects replay-aged or forged requests", () => {
    vi.stubEnv("META_APP_SECRET", "fixture-secret");
    const sign = (issued: number) => {
      const payload = Buffer.from(JSON.stringify({ user_id: "123", algorithm: "HMAC-SHA256", issued_at: issued })).toString("base64url");
      return `${createHmac("sha256", "fixture-secret").update(payload).digest("base64url")}.${payload}`;
    };
    expect(verifyFacebookSignedRequest(sign(Date.now() / 1000))).toEqual({ userId: "123" });
    expect(() => verifyFacebookSignedRequest(sign(Date.now() / 1000 - 90000))).toThrow();
    expect(() => verifyFacebookSignedRequest(`a${sign(Date.now() / 1000)}`)).toThrow();
  });
});
describe("official Meta transport contract", () => {
  it("uploads JPEG bytes in source, preserves text, and sends URL only as the comment", async () => {
    vi.stubEnv("META_GRAPH_API_VERSION", "v26.0"); vi.stubEnv("META_APP_SECRET", "fixture");
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ id: "22", post_id: "11_22" })).mockResolvedValueOnce(Response.json({ id: "22_33" }));
    const api = new FacebookClient("private-token", send);
    expect(await api.uploadPhoto("11", "Exact\ntext", Buffer.from([255, 216, 255]))).toEqual({ photoId: "22", postId: "11_22" });
    const [url, init] = send.mock.calls[0]!;
    expect(String(url)).toBe("https://graph.facebook.com/v26.0/11/photos");
    expect(init?.headers).toEqual({ authorization: "Bearer private-token" });
    const body = init!.body as FormData;
    expect(body.has("url")).toBe(false); expect(body.get("message")).toBe("Exact\ntext");
    expect(body.get("published")).toBe("true"); expect(body.get("appsecret_proof")).toBeTruthy();
    expect(Buffer.from(await (body.get("source") as Blob).arrayBuffer())).toEqual(Buffer.from([255, 216, 255]));
    expect(await api.comment("11_22", "https://newspoint.bg/novina/")).toBe("22_33");
    expect((send.mock.calls[1]![1]!.body as URLSearchParams).get("message")).toBe("https://newspoint.bg/novina/");
  });
  it("treats timeouts and malformed write responses as uncertain, without leaking tokens", async () => {
    const api = new FacebookClient("do-not-log", vi.fn<typeof fetch>().mockRejectedValue(new Error("do-not-log")));
    const error = await api.comment("1_2", "url").catch(e => e as FacebookError);
    expect(error).toMatchObject({ uncertain: true, code: "transport" }); expect(String(error)).not.toContain("do-not-log");
    const malformed = new FacebookClient("token", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true })));
    await expect(malformed.uploadPhoto("1", "text", Buffer.from("x"))).rejects.toMatchObject({ uncertain: true });
  });
  it("distinguishes permission rejection, rate limit and ambiguous server failure", async () => {
    for (const [status, code, retryable, uncertain] of [[400, 190, false, false], [429, 4, true, false], [503, 2, true, true]] as const) {
      const api = new FacebookClient("token", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code, message: "secret-token" } }, { status })));
      await expect(api.comment("1_2", "url")).rejects.toMatchObject({ retryable, uncertain });
    }
  });
  it("uses only trusted Graph cursor pagination, never provider-supplied URLs", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data: [{ id: "1" }], paging: { next: "https://evil.invalid?token=secret", cursors: { after: "cursor" } } })).mockResolvedValueOnce(Response.json({ data: [{ id: "2" }] }));
    const api = new FacebookClient("token", send); expect(await api.comments("1_2")).toHaveLength(2);
    expect(new URL(String(send.mock.calls[1]![0])).hostname).toBe("graph.facebook.com");
    expect(new URL(String(send.mock.calls[1]![0])).searchParams.get("after")).toBe("cursor");
  });
  it("rejects unexpected graph object paths and unsafe permalinks", async () => {
    const send = vi.fn<typeof fetch>(); const api = new FacebookClient("token", send);
    await expect(api.comment("1/../../evil", "url")).rejects.toThrow(); expect(send).not.toHaveBeenCalled();
    expect(facebookPermalink("https://www.facebook.com/1/posts/2")).toBeTruthy();
    expect(facebookPermalink("https://facebook.com.evil.invalid/")).toBeNull(); expect(facebookPermalink("javascript:alert(1)")).toBeNull();
  });
});
