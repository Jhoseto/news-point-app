/** Photos live on the public site at /media. Production serves Studio on that same host, so the path stays relative. Only the direct local Studio port has no /media route. */
export function browserMediaSrc(url: string, port = defaultStudioPort()): string {
  if (!url.startsWith("/media/") || port !== "3001") return url;
  return `http://localhost:3000${url}`;
}

/** SSR must use the same port as the browser, or img src hydrates as /media vs localhost:3000. */
function defaultStudioPort(): string {
  if (typeof window !== "undefined") return window.location.port;
  if (process.env.NODE_ENV === "production") return "";
  return process.env.PORT || "3001";
}
