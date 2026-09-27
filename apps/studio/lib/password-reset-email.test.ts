import { describe, expect, it } from "vitest";
import { buildPasswordResetEmail } from "./password-reset-email";

describe("buildPasswordResetEmail", () => {
  it("escapes HTML in the reset URL", () => {
    const url = 'https://example.com/reset?token=a&b=<script>"x"';
    const { html } = buildPasswordResetEmail(url);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("https://example.com/reset?token=a&amp;b=");
  });

  it("keeps the plain-text body with the raw URL", () => {
    const url = "https://localhost:3000/admin/login/reset?token=abc";
    const { text, subject } = buildPasswordResetEmail(url);
    expect(subject).toContain("NewsPoint Studio");
    expect(text).toContain(url);
  });
});
