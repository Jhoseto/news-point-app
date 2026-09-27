import { afterEach, describe, expect, it } from "vitest";
import { absoluteStudioUrl, normalizePasswordResetUrl, readStudioPublicBaseUrl, withBase } from "./paths";

const savedPublic = process.env.STUDIO_PUBLIC_URL;
const savedNextPublic = process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL;

afterEach(() => {
  if (savedPublic === undefined) delete process.env.STUDIO_PUBLIC_URL;
  else process.env.STUDIO_PUBLIC_URL = savedPublic;
  if (savedNextPublic === undefined) delete process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL;
  else process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL = savedNextPublic;
});

describe("withBase", () => {
  it("prefixes /admin", () => {
    expect(withBase("/login/forgot/")).toBe("/admin/login/forgot/");
    expect(withBase("/api/auth")).toBe("/admin/api/auth");
  });
});

describe("readStudioPublicBaseUrl", () => {
  it("defaults to local web proxy", () => {
    delete process.env.STUDIO_PUBLIC_URL;
    delete process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL;
    expect(readStudioPublicBaseUrl()).toBe("http://localhost:3000/admin");
  });

  it("normalizes production host without /admin suffix", () => {
    process.env.STUDIO_PUBLIC_URL = "https://newspoint.bg";
    expect(readStudioPublicBaseUrl()).toBe("https://newspoint.bg/admin");
  });

  it("keeps explicit /admin path", () => {
    process.env.STUDIO_PUBLIC_URL = "https://newspoint.bg/admin/";
    expect(readStudioPublicBaseUrl()).toBe("https://newspoint.bg/admin");
  });
});

describe("absoluteStudioUrl", () => {
  it("builds reset page URL", () => {
    process.env.STUDIO_PUBLIC_URL = "https://newspoint.bg/admin";
    expect(absoluteStudioUrl("/login/reset")).toBe("https://newspoint.bg/admin/login/reset/");
  });
});

describe("normalizePasswordResetUrl", () => {
  it("moves token to the public reset route", () => {
    process.env.STUDIO_PUBLIC_URL = "https://newspoint.bg/admin";
    const normalized = normalizePasswordResetUrl("http://localhost:3001/admin/api/auth/reset?token=abc123");
    expect(normalized).toBe("https://newspoint.bg/admin/login/reset/?token=abc123");
  });
});
