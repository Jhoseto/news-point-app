import { describe, expect, it, vi } from "vitest";
import { studioSessionEnded } from "./session-probe";

describe("Studio session monitor", () => {
  it("detects a revoked or expired session and sends an uncached same-origin request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(null))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect(await studioSessionEnded(fetcher)).toBe(true);
    expect(await studioSessionEnded(fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith("/admin/api/auth/get-session", expect.objectContaining({ cache: "no-store", credentials: "same-origin", signal: expect.any(AbortSignal) }));
  });

  it("keeps the editor open for a valid session or transient service/network failure", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ session: { id: "active" } }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockRejectedValueOnce(new Error("offline"));
    expect(await studioSessionEnded(fetcher)).toBe(false);
    expect(await studioSessionEnded(fetcher)).toBe(false);
    expect(await studioSessionEnded(fetcher)).toBe(false);
  });
});
