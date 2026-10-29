import { afterEach, expect, it, vi } from "vitest";
import { InstagramClient, instagramConfiguration, instagramPermalink } from "./instagram-api";
import { normalizeInstagram, normalizeSocial, socialInput, instagramText } from "./social-publishing";
const config = { webhook: "https://hook.eu1.make.com/explicit-fixture", apiKey: "private-fixture", accountId: "123", username: "newspointbg" };
const input = { jobId: "00000000-0000-4000-8000-000000000001", accountId: "123", caption: "Изолирана тестова снимка",
    imageUrl: `https://newspoint.bg/media/news/social-instagram/00000000-0000-4000-8000-000000000001-${"a".repeat(64)}.jpg`, articleUrl: "https://newspoint.bg/test-news/" };
afterEach(() => vi.unstubAllEnvs());
it("keeps Instagram opt-in independent and follows titles only until edited", () => {
    expect(normalizeInstagram(undefined, "Заглавие")).toEqual({ enabled: false, text: instagramText("Заглавие"), textMode: "auto" });
    const custom = { enabled: true, text: "Текст на редактора", textMode: "custom" as const };
    expect(normalizeInstagram(custom, "Ново")).toEqual(custom);
    expect(normalizeSocial({ facebook: { enabled: false, text: "", textMode: "auto" }, instagram: custom }, "Ново").instagram).toEqual(custom);
    expect(socialInput.safeParse({ facebook: { enabled: false, text: "", textMode: "auto" }, instagram: { ...custom, text: "x".repeat(2201) } }).success).toBe(false);
});
it("uses the first five article sentences for automatic Instagram text", () => {
    const body = [{ type: "paragraph", html: "<p>Първо изречение. Второ изречение! Трето?</p>" },
        { type: "image", mediaAssetId: "550e8400-e29b-41d4-a716-446655440000", caption: "Това не влиза." },
        { type: "paragraph", html: "<p>Четвърто изречение. Пето изречение. Шесто не трябва.</p>" }];
    expect(instagramText("Заглавие", body)).toBe("Първо изречение. Второ изречение! Трето? Четвърто изречение. Пето изречение.");
    expect(normalizeInstagram({ enabled: true, text: "старо", textMode: "auto" }, "Заглавие", body).text).toBe(instagramText("Заглавие", body));
});
it("does not expose unconfigured or arbitrary webhook destinations", () => {
    vi.stubEnv("MAKE_INSTAGRAM_WEBHOOK_URL", config.webhook);
    vi.stubEnv("MAKE_INSTAGRAM_WEBHOOK_API_KEY", config.apiKey);
    vi.stubEnv("MAKE_INSTAGRAM_ACCOUNT_ID", config.accountId);
    vi.stubEnv("MAKE_INSTAGRAM_USERNAME", config.username);
    expect(instagramConfiguration()).toEqual(config);
    vi.stubEnv("MAKE_INSTAGRAM_WEBHOOK_URL", "https://example.invalid/hook");
    expect(instagramConfiguration()).toBeNull();
});
it("sends only the snapshotted public image/caption and confirms the exact account", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, postId: "456", accountId: "123", permalink: "https://www.instagram.com/p/Test123/" }));
    expect(await new InstagramClient(config, send).publish(input)).toEqual({ postId: "456", permalink: "https://www.instagram.com/p/Test123/" });
    expect(JSON.parse(send.mock.calls[0]![1]!.body as string)).toEqual({ action: "publish", ...input });
    expect(send.mock.calls[0]![1]!.headers).toMatchObject({ "x-make-apikey": "private-fixture" });
});
it("holds ambiguous responses without unsafe retries and without logging secrets", async () => {
    for (const response of [new Error("private-fixture"), Response.json({ ok: true, postId: "456", accountId: "999", permalink: "https://www.instagram.com/p/Test123/" }), new Response("Accepted"), Response.json({ error: "private-fixture" }, { status: 503 })]) {
        const send = vi.fn<typeof fetch>();
        if (response instanceof Error)
            send.mockRejectedValue(response);
        else
            send.mockResolvedValue(response);
        const error = await new InstagramClient(config, send).publish(input).catch(e => e);
        expect(error).toMatchObject({ uncertain: true, retryable: false });
        expect(String(error)).not.toContain("private-fixture");
    }
});
it("only retries a documented failure before publication", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false, stage: "before_publish", code: "rate_limit", retryable: true }, { status: 429, headers: { "retry-after": "60" } }));
    await expect(new InstagramClient(config, send).publish(input)).rejects.toMatchObject({ uncertain: false, retryable: true, retryAfter: 60000 });
});
it("rejects drafts, other image hosts, credentials and untrusted result links", async () => {
    const send = vi.fn<typeof fetch>();
    const api = new InstagramClient(config, send);
    for (const imageUrl of ["https://evil.invalid/photo.jpg", "https://newspoint.bg/media/drafts/a.jpg", input.imageUrl + "?secret=x", input.imageUrl.replace("https://", "https://user:pass@")])
        await expect(api.publish({ ...input, imageUrl })).rejects.toMatchObject({ code: "image" });
    await expect(api.publish({ ...input, accountId: "999" })).rejects.toMatchObject({ code: "connection" });
    expect(send).not.toHaveBeenCalled();
    for (const url of ["https://instagram.com.evil.invalid/p/a/", "https://user:pass@instagram.com/p/a/", "http://instagram.com/p/a/"])
        expect(instagramPermalink(url)).toBeNull();
});
