import { Buffer } from "node:buffer";
import { z } from "zod";

export const CATEGORY_PAGE_SIZE = 30;
// Keep PostgreSQL microseconds: a JS Date would truncate ties within a millisecond.
export const archiveTimestampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/)
  .refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19));
const cursorSchema = z.object({
  v: z.literal(1),
  category: z.uuid(),
  anchor: archiveTimestampSchema,
  direction: z.enum(["older", "newer"]),
  boundary: z.object({ at: archiveTimestampSchema, id: z.uuid() }).strict(),
}).strict();
export type CategoryCursor = z.infer<typeof cursorSchema>;

/** Public navigation state, never an authorization token. SQL still checks visibility. */
export function parseCategoryCursor(raw: string | string[] | undefined, category: string, now = Date.now()): CategoryCursor | null {
  if (raw === undefined) return null;
  if (typeof raw !== "string" || raw.length > 640 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error("Invalid archive cursor");
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    if (cursor.category !== category || Date.parse(cursor.anchor) > now + 60_000 || cursor.boundary.at > cursor.anchor) throw new Error();
    return cursor;
  } catch {
    throw new Error("Invalid archive cursor");
  }
}

export function categoryCursorUrl(path: string, cursor: CategoryCursor): string {
  const value = Buffer.from(JSON.stringify(cursorSchema.parse(cursor))).toString("base64url");
  const base = path.endsWith("/") ? path.slice(0, -1) : path;
  return `${base}/archive/${value}/`;
}
