/** Public, cookie-independent files only. This changes bypass matching, never origin TTLs. */
const groups = [
  { prefixes: ["/_next/static/", "/admin/_next/static/"], extensions: ["css", "js", "woff", "woff2", "ttf", "otf"] },
  { prefixes: ["/fonts/"], extensions: ["woff", "woff2", "ttf", "otf"] },
  { prefixes: ["/media/news/"], extensions: ["jpg", "jpeg", "png", "webp", "gif", "avif"] },
];
export const originalPrivateBypassExpression = '(http.host in {"newspoint.bg" "www.newspoint.bg"} and (starts_with(http.request.uri.path, "/admin") or starts_with(http.request.uri.path, "/api") or starts_with(http.request.uri.path, "/settings") or starts_with(http.request.uri.path, "/search") or http.cookie ne ""))';

export function publicStaticAsset(path) {
  if (path.includes("..") || path.includes("%") || path.includes("\\")) return false;
  const extension = path.split(".").at(-1);
  return groups.some(group => group.prefixes.some(prefix => path.startsWith(prefix)) && group.extensions.includes(extension));
}

export function privateBypassRequired(host, path, cookie = "") {
  const matched = ["newspoint.bg", "www.newspoint.bg"].includes(host)
    && (cookie !== "" || ["/admin", "/api", "/settings", "/search"].some(prefix => path.startsWith(prefix)));
  return matched && !publicStaticAsset(path);
}

const safeGroups = groups.map(group => `(${group.prefixes.map(prefix => `starts_with(http.request.uri.path, "${prefix}")`).join(" or ")} ) and http.request.uri.path.extension in {${group.extensions.map(ext => `"${ext}"`).join(" ")}}`);
const staticExpression = `(not (http.request.uri.path contains ".." or http.request.uri.path contains "%" or http.request.uri.path contains "\\\\") and (${safeGroups.map(group => `(${group})`).join(" or ")}))`;
export const privateBypassExpression = `(${originalPrivateBypassExpression} and not ${staticExpression})`;
