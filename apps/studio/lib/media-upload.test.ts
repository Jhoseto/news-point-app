import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { POST } from "../app/api/editor/media/upload/route";

const context = vi.hoisted(() => ({ authenticated: true, write: vi.fn(), remove: vi.fn(), download: vi.fn() }));
vi.mock("./remote-photo", () => ({ downloadRemotePhoto: context.download }));
vi.mock("./auth", () => ({ studioOrigins: () => ({ trusted: ["http://localhost:3001"] }) }));
vi.mock("./session", () => ({ staffFromRequest: () => context.authenticated ? { id: "qa-editor", role: "editor" } : null }));
vi.mock("./media-disk", () => ({ writeMediaFile: context.write, removeMediaFile: context.remove }));
beforeEach(() => { context.authenticated = true; context.download.mockReset(); context.write.mockReset(); context.remove.mockReset(); context.remove.mockResolvedValue(undefined); });
const request = (body: BodyInit, extra: Record<string, string> = {}) => new Request("http://localhost:3001/admin/api/editor/media/upload/", { method: "POST", headers: { origin: "http://localhost:3001", ...extra }, body });
const form = (bytes: Uint8Array) => { const result = new FormData(); result.set("file", new File([bytes as BlobPart], "qa.png", { type: "image/png" })); return result; };

describe("Studio media upload failures", () => {
  it("authenticates remote imports before fetching and keeps download errors private", async () => {
    const remote=()=>request(JSON.stringify({url:"https://example.org/a.png"}),{"content-type":"application/json"});
    context.authenticated=false;expect((await POST(remote())).status).toBe(401);expect(context.download).not.toHaveBeenCalled();
    context.authenticated=true;context.download.mockRejectedValue(Error("private socket details"));
    const result=await POST(remote());expect(result.status).toBe(400);expect(JSON.stringify(await result.json())).not.toContain("private socket");expect(context.write).not.toHaveBeenCalled();
  });
  it("runs imported image bytes through the same optimizer and storage rollback", async () => {
    const bytes=await sharp({create:{width:640,height:320,channels:3,background:"#223344"}}).png().toBuffer();
    context.download.mockResolvedValue({bytes,type:"image/png"});context.write.mockRejectedValue(Error("private disk error"));
    const response=await POST(request(JSON.stringify({url:"https://example.org/a.png",alt:"Копирана снимка"}),{"content-type":"application/json"}));
    expect(response.status).toBe(500);expect(context.download).toHaveBeenCalledWith("https://example.org/a.png",25*1024*1024);
    expect(context.write).toHaveBeenCalledTimes(3);
    for(const [key,buffer] of context.write.mock.calls){expect(key).toMatch(/\.webp$/);expect((await sharp(buffer).metadata()).format).toBe("webp");}
    expect(context.remove).toHaveBeenCalledTimes(3);
  });
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
