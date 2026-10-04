import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { directPerformance, factPack, generateImage, generateMusic, interact, storyScript, synthesize } from "./ai-gemini";

const response = (text: string) => ({ ok: true, status: 200, json: async () => ({ steps: [{ type: "model_output", content: [{ type: "text", text }] }] }) });

describe("Gemini podcast adapter", () => {
  beforeEach(() => { process.env.GEMINI_API_KEY = "test-only"; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GEMINI_API_KEY; });

  it("reports the transport cause when Gemini cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause: new Error("unable to verify certificate") })));
    await expect(interact({ model: "gemini-3.8-flash", input: "ping" })).rejects.toThrow("Gemini connection failed: unable to verify certificate");
  });

  it("accepts only performance tags without changing words", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(JSON.stringify({ lines: [{ spoken: "<breath> Добро утро." }] }))));
    const result = await directPerformance([{ speaker: "alex", text: "Добро утро.", direction: "" }]);
    expect(result.lines[0]?.spoken).toBe("<breath> Добро утро.");
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
  });

  it("rejects extra claims injected by the performance director", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(JSON.stringify({ lines: [{ spoken: "Добро утро. Кметът каза да." }] }))));
    await expect(directPerformance([{ speaker: "alex", text: "Добро утро.", direction: "" }])).rejects.toThrow("changed spoken words");
  });

  it("sends separate speaker turns and expects WAV", async () => {
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(64)]).toString("base64");
    const mocked = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ steps: [{ type: "model_output", content: [{ type: "audio", data: wav }] }] }) });
    vi.stubGlobal("fetch", mocked);
    const result = await synthesize([{ speaker: "alex", text: "Здравей", direction: "", spoken: "<breath> Здравей" }, { speaker: "maya", text: "Привет", direction: "" }], { alex: "Puck", maya: "Kore" });
    expect(result.bytes.toString("ascii", 0, 4)).toBe("RIFF");
    const sent = JSON.parse(String(mocked.mock.calls[0]?.[1]?.body));
    expect(sent.generation_config.speech_config.speakers).toEqual([{ speaker: "Alex", voice: "Puck" }, { speaker: "Maya", voice: "Kore" }]);
    expect(sent.input[0].content[0].text).toBe("<breath> Здравей");
  });

  it("requests audio output from Lyria before accepting an MP3", async () => {
    const music = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(1200)]).toString("base64");
    const mocked = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ steps: [{ type: "model_output", content: [{ type: "audio", data: music }] }] }) });
    vi.stubGlobal("fetch", mocked);
    await generateMusic("Умерен инструментален ритъм");
    const sent = JSON.parse(String(mocked.mock.calls[0]?.[1]?.body));
    expect(sent.response_format).toEqual({ type: "audio" });
    expect(sent.model).toBe("lyria-3.5");
  });

  it("requests the JPEG image format accepted by Gemini Interactions", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const mocked = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ steps: [{ type: "model_output", content: [{ type: "image", data: jpeg.toString("base64") }] }] }) });
    vi.stubGlobal("fetch", mocked);
    await expect(generateImage(["Пловдив"])).resolves.toMatchObject({ bytes: jpeg });
    const sent = JSON.parse(String(mocked.mock.calls[0]?.[1]?.body));
    expect(sent.response_format).toMatchObject({ type: "image", mime_type: "image/jpeg", aspect_ratio: "1:1" });
  });

  it("retries one transient Lyria rejection with a shorter instrumental prompt", async () => {
    const music = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(1200)]).toString("base64");
    const mocked = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: "temporary rejection" } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ steps: [{ type: "model_output", content: [{ type: "audio", data: music }] }] }) });
    vi.stubGlobal("fetch", mocked);
    await expect(generateMusic("calm instrumental pulse")).resolves.toMatchObject({ bytes: expect.any(Buffer) });
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(mocked.mock.calls[1]?.[1]?.body)).input).toContain("Instrumental news podcast music");
  });

  it("rejects quotations absent from the published source snapshot", async () => {
    const mocked = vi.fn().mockResolvedValue(response(JSON.stringify({ facts: ["Има решение."], quotes: ["Несъществуващ цитат"], uncertainties: [] })));
    vi.stubGlobal("fetch", mocked);
    await expect(factPack({ id: "550e8400-e29b-41d4-a716-446655440001", title: "Решение", path: "/reshenie", excerpt: "", text: "Има решение.", version: 1, publishedRevision: 1, publishedAt: new Date().toISOString() })).rejects.toThrow("quote absent");
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it("asks for a corrected story when Gemini misses the duration budget", async () => {
    const draft = (count: number) => response(JSON.stringify({ label: "Сюжет", lines: [{ speaker: "alex", text: Array(count / 2).fill("дума").join(" "), direction: "" }, { speaker: "maya", text: Array(count / 2).fill("дума").join(" "), direction: "" }] }));
    const mocked = vi.fn().mockResolvedValueOnce(draft(20)).mockResolvedValueOnce(draft(100));
    vi.stubGlobal("fetch", mocked);
    const source = { id: "550e8400-e29b-41d4-a716-446655440001", title: "Решение", path: "/reshenie", excerpt: "", text: "Има решение.", version: 1, publishedRevision: 1, publishedAt: new Date().toISOString() };
    const result = await storyScript(source, { facts: ["Има решение."], quotes: [], uncertainties: [] }, 100, "natural", "");
    expect(result.value.lines.map((line) => line.text.split(" ").length)).toEqual([50, 50]);
    expect(mocked).toHaveBeenCalledTimes(2);
  });
});
