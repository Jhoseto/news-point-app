/** Proxy headers are not evidence of trust. WEB_URL is set by the operator. */
export function isSubmissionOrigin(request: Request, publicUrl = process.env.WEB_URL): boolean {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  if (origin === new URL(request.url).origin) return true;
  if (!publicUrl) return false;
  try {
    const url = new URL(publicUrl);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && origin === url.origin;
  } catch { return false; }
}
