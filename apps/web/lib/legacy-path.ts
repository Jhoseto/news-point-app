/** Next supplies decoded path segments; imported WordPress paths may retain UTF-8 escapes. */
export function legacyPathCandidates(path: string): string[] {
  const encoded = path.replace(/[^\x00-\x7f]+/g, (text) => encodeURIComponent(text));
  return [...new Set([path, encoded, encoded.replace(/%[0-9a-f]{2}/gi, (escape) => escape.toLowerCase())])];
}
