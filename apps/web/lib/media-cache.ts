/** Content-hashed WebP variants never change at the same URL. Originals can be replaced. */
export function mediaCacheControl(storageKey: string): string {
  const name = storageKey.split("/").pop() ?? "";
  return /^[0-9a-f]{64}\.webp$/i.test(name)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=86400";
}
