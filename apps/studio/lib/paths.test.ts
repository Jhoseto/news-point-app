import { afterEach, describe, expect, it } from "vitest";
import {
  absoluteStudioUrl,
  normalizePasswordResetUrl,
  readStudioPublicBaseUrl,
  studioTrustedOrigins,
  withBase,
} from "./paths";

const savedPublic = process.env.STUDIO_PUBLIC_URL;
const savedNextPublic = process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL;
const savedWeb = process.env.WEB_URL;
const savedTunnel = process.env.NP_ALLOW_CF_TUNNEL;
const savedExtras = process.env.STUDIO_EXTRA_TRUSTED_ORIGINS;
const savedStudioUrl = process.env.STUDIO_URL;
const savedNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, "NODE_ENV", { value, configurable: true, writable: true, enumerable: true });
}

afterEach(() => {
  if (savedPublic === undefined) delete process.env.STUDIO_PUBLIC_URL;
  else process.env.STUDIO_PUBLIC_URL = savedPublic;
  if (savedNextPublic === undefined) delete process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL;
  else process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL = savedNextPublic;
  if (savedWeb === undefined) delete process.env.WEB_URL;
  else process.env.WEB_URL = savedWeb;
  if (savedTunnel === undefined) delete process.env.NP_ALLOW_CF_TUNNEL;
  else process.env.NP_ALLOW_CF_TUNNEL = savedTunnel;
  if (savedStudioUrl === undefined) delete process.env.STUDIO_URL;
  else process.env.STUDIO_URL = savedStudioUrl;
  setNodeEnv(savedNodeEnv);
  if (savedExtras === undefined) delete process.env.STUDIO_EXTRA_TRUSTED_ORIGINS;
  else process.env.STUDIO_EXTRA_TRUSTED_ORIGINS = savedExtras;
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

describe("studioTrustedOrigins", () => {
  it("does not include the trycloudflare wildcard by default", () => {
    delete process.env.NP_ALLOW_CF_TUNNEL;
    const origins = studioTrustedOrigins();
    expect(origins).not.toContain("https://*.trycloudflare.com");
    expect(origins.some((origin) => origin.includes("*"))).toBe(false);
  });

  it("includes the trycloudflare wildcard only when NP_ALLOW_CF_TUNNEL=1", () => {
    process.env.NP_ALLOW_CF_TUNNEL = "1";
    expect(studioTrustedOrigins()).toContain("https://*.trycloudflare.com");
  });

  it("treats any other value as off", () => {
    process.env.NP_ALLOW_CF_TUNNEL = "true";
    const origins = studioTrustedOrigins();
    expect(origins).not.toContain("https://*.trycloudflare.com");
  });

  it("uses STUDIO_EXTRA_TRUSTED_ORIGINS to grant a specific tunnel host", () => {
    delete process.env.NP_ALLOW_CF_TUNNEL;
    process.env.STUDIO_EXTRA_TRUSTED_ORIGINS = "https://cyber-outsourcing-mails-series.trycloudflare.com";
    expect(studioTrustedOrigins()).toContain("https://cyber-outsourcing-mails-series.trycloudflare.com");
  });

  it("does not trust localhost:3001 in production when STUDIO_URL is missing", () => {
    setNodeEnv("production");
    delete process.env.STUDIO_URL;
    const origins = studioTrustedOrigins();
    expect(origins).not.toContain("http://localhost:3001");
  });

  it("trusts localhost:3001 in development when STUDIO_URL is missing", () => {
    setNodeEnv(undefined);
    delete process.env.STUDIO_URL;
    const origins = studioTrustedOrigins();
    expect(origins).toContain("http://localhost:3001");
  });
});

describe("normalizePasswordResetUrl", () => {
  it("moves token to the public reset route", () => {
    process.env.STUDIO_PUBLIC_URL = "https://newspoint.bg/admin";
    const normalized = normalizePasswordResetUrl("http://localhost:3001/admin/api/auth/reset?token=abc123");
    expect(normalized).toBe("https://newspoint.bg/admin/login/reset/?token=abc123");
  });
});
