import "server-only";
import { buildPasswordResetEmail } from "./password-reset-email";

/** Called without awaiting by Better Auth to avoid account-enumeration timing. */
export async function sendPasswordResetEmail(to: string, url: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      // Tokens are never logged in production, even with the development flag set.
      if (process.env.NODE_ENV !== "production" && process.env.STUDIO_PASSWORD_RESET_LOG === "1") {
        console.info(`[studio-mail] Development password reset for ${to}:\n${url}`);
      } else {
        console.warn("[studio-mail] reset_not_sent: provider_not_configured");
      }
      return;
    }
    const message = buildPasswordResetEmail(url);
    const from = process.env.STUDIO_EMAIL_FROM?.trim() || "NewsPoint Studio <onboarding@resend.dev>";
    const response = await Promise.race([
      fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject: message.subject, html: message.html, text: message.text }),
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("mail_timeout"));
        }, 15_000);
      }),
    ]);
    // Provider bodies and thrown errors can contain recipient/token/request data.
    // Status alone is sufficient for operations; never retry an uncertain delivery.
    if (!response.ok) console.error(`[studio-mail] reset_delivery_failed: http_${response.status}`);
    if (response.body) void response.body.cancel().catch(() => undefined);
  } catch {
    console.error(controller.signal.aborted
      ? "[studio-mail] reset_delivery_unknown: timeout"
      : "[studio-mail] reset_delivery_unknown: network_or_provider_error");
  } finally {
    clearTimeout(timer);
  }
}
