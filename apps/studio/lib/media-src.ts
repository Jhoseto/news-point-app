/** Photos live on the public site at /media. Production serves Studio on that same host, so the path stays relative. Only the direct local Studio port has no /media route. */
export function browserMediaSrc(url: string, port = typeof window === "undefined" ? "" : window.location.port): string {
  if (!url.startsWith("/media/") || port !== "3001") return url;
  return `http://localhost:3000${url}`;
}
