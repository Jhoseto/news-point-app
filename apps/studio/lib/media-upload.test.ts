import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { POST } from "../app/api/editor/media/upload/route";

const context = vi.hoisted(() => ({ authenticated: true, write: vi.fn(), remove: vi.fn() }));
vi.mock("./auth", () => ({ studioOrigins: () => ({ trusted: ["http://localhost:3001"] }) }));
vi.mock("./session", () => ({ staffFromRequest: () => context.authenticated ? { id: "qa-editor", role: "editor" } : null }));
vi.mock("./media-disk", () => ({ writeMediaFile: context.write, removeMediaFile: context.remove }));
beforeEach(() => { context.authenticated = true; context.write.mockReset(); context.remove.mockReset(); context.remove.mockResolvedValue(undefined); });
const request = (body: BodyInit, extra: Record<string, string> = {}) => new Request("http://localhost:3001/admin/api/editor/media/upload/", { method: "POST", headers: { origin: "http://localhost:3001", ...extra }, body });
const form = (bytes: Uint8Array) => { const result = new FormData(); result.set("file", new File([bytes as BlobPart], "qa.png", { type: "image/png" })); return result; };

describe("Studio media upload failures", () => {
  it("rejects expired sessions, foreign origins and oversized payloads before writing", async () => {
    context.authenticated = false;
    expect((await POST(request(form(new Uint8Array())))).status).toBe(401);
    context.authenticated = true;
    expect((await POST(request(form(new Uint8Array()), { origin: "https://foreign.invalid" }))).status).toBe(403);
    expect((await POST(request("oversized", { "content-length": String(26 * 1024 * 1024) }))).status).toBe(413);
    expect(context.write).not.toHaveBeenCalled();
  });
  it("returns readable private errors for corrupt photos and malformed multipart", async () => {
    const corrupt = await POST(request(form(new TextEncoder().encode("QA invalid image"))));
    expect(corrupt.status).toBe(400); expect(corrupt.headers.get("cache-control")).toBe("no-store");
    expect(await corrupt.json()).toEqual({ error: { message: "Файлът не е валидна или поддържана снимка." } });
    expect((await POST(request("broken", { "content-type": "multipart/form-data; boundary=qa" }))).status).toBe(400);
    expect(context.write).not.toHaveBeenCalled();
  });
  it("settles parallel storage writes before cleanup and keeps server details private", async () => {
    const input = await sharp({ create: { width: 640, height: 320, channels: 3, background: "#223344" } }).png().toBuffer();
    context.write.mockImplementation(async (key: string) => { if (key.includes("-w320")) throw new Error("QA private storage detail"); await new Promise(resolve => setTimeout(resolve, 20)); });
    const response = await POST(request(form(input)));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { message: "Качването не беше успешно. Опитайте отново." } });
    expect(context.write).toHaveBeenCalledTimes(3); expect(context.remove).toHaveBeenCalledTimes(3);
    expect(context.remove.mock.calls.map(([key]) => key).sort()).toEqual(context.write.mock.calls.map(([key]) => key).sort());
  });
});
