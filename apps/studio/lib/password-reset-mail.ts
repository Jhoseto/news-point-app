import "server-only";
import { buildPasswordResetEmail } from "./password-reset-email";

/** Fire-and-forget from Better Auth; must not await in the auth hook (timing). */
export function sendPasswordResetEmail(to: string, url: string) {
  const message = buildPasswordResetEmail(url);
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.STUDIO_EMAIL_FROM?.trim() ?? "NewsPoint Studio <onboarding@resend.dev>";

  if (apiKey) {
    void fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: message.subject, html: message.html, text: message.text }),
    }).then(async (response) => {
      if (!response.ok) console.error(`[studio-mail] Resend ${response.status}: ${await response.text()}`);
    });
    return;
  }

  if (process.env.NODE_ENV !== "production" || process.env.STUDIO_PASSWORD_RESET_LOG === "1") {
    console.info(`[studio-mail] Password reset for ${to}:\n${url}`);
    return;
  }

  console.warn("[studio-mail] RESEND_API_KEY is not set; password reset email was not sent.");
}
