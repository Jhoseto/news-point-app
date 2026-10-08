/** Content-hashed WebP variants never change at the same URL. Ladder siblings are additive. */
export function mediaCacheControl(storageKey: string): string {
  const name = storageKey.split("/").pop() ?? "";
  if (/^[0-9a-f]{64}\.webp$/i.test(name)) return "public, max-age=31536000, immutable";
  // Responsive ladder / legacy card: written once beside the master, stable URL.
  if (/-w\d+\.webp$/i.test(name) || /-card\.webp$/i.test(name)) {
    return "public, max-age=2592000, stale-while-revalidate=86400";
  }
  // Masters change rarely; 30d matches ladder so PSI “efficient cache” stops flagging them.
  if (/\.webp$/i.test(name)) return "public, max-age=2592000, stale-while-revalidate=86400";
  return "public, max-age=86400";
}
