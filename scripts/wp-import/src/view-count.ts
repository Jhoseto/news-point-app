/** Exact total from Post Views Counter's public read endpoint. Not an increment. */
export function parseViewCount(body: string): number | null {
  const value = Number(body.trim());
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value;
}
