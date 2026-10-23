import { afterEach, describe, expect, it, vi } from "vitest";
import { MAKE_SOCIAL_MAX_PHOTO_BYTES, MakeSocialClient, MakeSocialError, makeSocialConfiguration, usesMakeSocialProvider } from "./make-social-api";

afterEach(() => vi.unstubAllEnvs());

describe("Make social webhook client", () => {
  it("sends the API key and a private multipart JPEG", async () => {
    const send = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      expect(new Headers(init?.headers).get("x-make-apikey")).toBe("private-key");
      const body = init?.body as FormData;
      expect(body.get("action")).toBe("publish"); expect(body.get("jobId")).toBe("job-1");
      expect(body.get("message")).toBe("News"); expect(body.get("articleUrl")).toBe("https://newspoint.bg/news/");
      const photo = body.get("photo") as File;
      expect(photo).toMatchObject({ name: "job-1.jpg", type: "image/jpeg", size: 4 });
      return Response.json({ ok: true, postId: "11_22", commentId: "22_33", permalink: "https://www.facebook.com/11/posts/22" });
    });
    const result = await new MakeSocialClient("https://hook.eu2.make.com/example", "private-key", send)
      .publish({ jobId: "job-1", message: "News", articleUrl: "https://newspoint.bg/news/", photo: Buffer.from("jpeg") });
    expect(result).toMatchObject({ postId: "11_22", commentId: "22_33" });
  });

  it("rejects empty and oversized files before any request", async () => {
    const send = vi.fn<typeof fetch>(); const client = new MakeSocialClient("https://hook.eu2.make.com/example", "key", send);
    expect(() => client.publish({ jobId: "1", message: "x", articleUrl: "https://newspoint.bg/x/", photo: Buffer.alloc(0) })).toThrowError(MakeSocialError);
    expect(() => client.publish({ jobId: "1", message: "x", articleUrl: "https://newspoint.bg/x/", photo: Buffer.alloc(MAKE_SOCIAL_MAX_PHOTO_BYTES + 1) })).toThrowError(MakeSocialError);
    expect(send).not.toHaveBeenCalled();
  });

  it("preserves a post id when only the comment failed", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false, code: "comment_failed", retryable: true, postId: "11_22" }, { status: 502 }));
    await expect(new MakeSocialClient("https://hook.eu2.make.com/example", "key", send)
      .publish({ jobId: "1", message: "x", articleUrl: "https://newspoint.bg/x/", photo: Buffer.from("x") }))
      .rejects.toMatchObject({ code: "comment_failed", postId: "11_22", uncertain: false });
  });

  it("marks a lost publish response uncertain but retries a declared pre-publish rejection", async () => {
    const lost = new MakeSocialClient("https://hook.eu2.make.com/example", "key", vi.fn<typeof fetch>().mockRejectedValue(new Error("secret detail")));
    await expect(lost.publish({ jobId: "1", message: "x", articleUrl: "https://newspoint.bg/x/", photo: Buffer.from("x") }))
      .rejects.toMatchObject({ code: "lost_response", retryable: true, uncertain: true });
    const safe = new MakeSocialClient("https://hook.eu2.make.com/example", "key", vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ ok: false, code: "busy", stage: "before_publish", retryable: true }, { status: 429, headers: { "retry-after": "7" } })));
    await expect(safe.publish({ jobId: "1", message: "x", articleUrl: "https://newspoint.bg/x/", photo: Buffer.from("x") }))
      .rejects.toMatchObject({ code: "busy", retryable: true, uncertain: false, retryAfter: 7000 });
  });

  it("validates configured secrets without returning partial configuration", () => {
    vi.stubEnv("SOCIAL_PUBLISHING_PROVIDER", "make"); vi.stubEnv("MAKE_SOCIAL_WEBHOOK_URL", "https://hook.eu2.make.com/example");
    vi.stubEnv("MAKE_SOCIAL_WEBHOOK_API_KEY", "key"); vi.stubEnv("MAKE_FACEBOOK_PAGE_ID", "11"); vi.stubEnv("MAKE_FACEBOOK_PAGE_NAME", "News Point");
    expect(usesMakeSocialProvider()).toBe(true);
    expect(makeSocialConfiguration()).toMatchObject({ pageId: "11", pageName: "News Point" });
    vi.stubEnv("MAKE_SOCIAL_WEBHOOK_URL", "http://hook.eu2.make.com/example"); expect(makeSocialConfiguration()).toBeNull();
    vi.stubEnv("MAKE_SOCIAL_WEBHOOK_URL", "https://user:password@hook.eu2.make.com/example"); expect(makeSocialConfiguration()).toBeNull();
    vi.stubEnv("SOCIAL_PUBLISHING_PROVIDER", "meta"); expect(usesMakeSocialProvider()).toBe(false);
  });

  it("rejects malformed success responses", async () => {
    const client = new MakeSocialClient("https://hook.eu2.make.com/example", "key", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, postId: 1122 })));
    await expect(client.comment({ jobId: "1", articleUrl: "https://newspoint.bg/x/", postId: "11_22" }))
      .rejects.toBeInstanceOf(MakeSocialError);
  });
});
