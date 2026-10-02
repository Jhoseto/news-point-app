import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { directPerformance, generateMusic, synthesize } from "./ai-gemini";

const response = (text: string) => ({ ok: true, status: 200, json: async () => ({ steps: [{ type: "model_output", content: [{ type: "text", text }] }] }) });

describe("Gemini podcast adapter", () => {
  beforeEach(() => { process.env.GEMINI_API_KEY = "test-only"; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GEMINI_API_KEY; });

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
});
