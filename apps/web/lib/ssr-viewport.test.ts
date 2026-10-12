import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

import { cookies, headers } from "next/headers";
import { ssrDesktopViewport } from "./ssr-viewport";

function mockHeaders(map: Record<string, string>) {
  vi.mocked(headers).mockResolvedValue({
    get: (key: string) => map[key.toLowerCase()] ?? map[key] ?? null,
  } as Headers);
}

describe("ssrDesktopViewport", () => {
  it("uses Sec-CH-UA-Mobile when present", async () => {
    mockHeaders({ "sec-ch-ua-mobile": "?1" });
    expect(await ssrDesktopViewport()).toBe(false);
    mockHeaders({ "sec-ch-ua-mobile": "?0" });
    expect(await ssrDesktopViewport()).toBe(true);
  });

  it("uses viewport width client hint", async () => {
    mockHeaders({ "sec-ch-viewport-width": "390", "sec-ch-ua-mobile": "?0" });
    expect(await ssrDesktopViewport()).toBe(false);
    mockHeaders({ "sec-ch-viewport-width": "1280", "sec-ch-ua-mobile": "?1" });
    expect(await ssrDesktopViewport()).toBe(true);
  });

  it("falls back to mobile UA", async () => {
    mockHeaders({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" });
    expect(await ssrDesktopViewport()).toBe(false);
  });

  it("defaults to desktop for bots without hints", async () => {
    mockHeaders({ "user-agent": "Googlebot/2.1" });
    expect(await ssrDesktopViewport()).toBe(true);
  });

  it("uses the measured CSS breakpoint even when a width hint disagrees", async () => {
    mockHeaders({ "sec-ch-ua-mobile": "?0", "sec-ch-viewport-width": "1200" });
    vi.mocked(cookies).mockResolvedValueOnce({ get: () => ({ name: "np-viewport", value: "mobile" }) } as Awaited<ReturnType<typeof cookies>>);
    expect(await ssrDesktopViewport()).toBe(false);
    mockHeaders({ "user-agent": "iPhone" });
    vi.mocked(cookies).mockResolvedValueOnce({ get: () => ({ name: "np-viewport", value: "desktop" }) } as Awaited<ReturnType<typeof cookies>>);
    expect(await ssrDesktopViewport()).toBe(true);
  });

  it("ignores invalid cookies and width hints", async () => {
    mockHeaders({ "sec-ch-viewport-width": "NaN", "user-agent": "iPhone" });
    vi.mocked(cookies).mockResolvedValueOnce({ get: () => ({ name: "np-viewport", value: "invalid" }) } as Awaited<ReturnType<typeof cookies>>);
    expect(await ssrDesktopViewport()).toBe(false);
  });
});
