import "server-only";
import type { z } from "zod";
import { EditorError } from "./articles";
import { studioOrigins } from "./auth";
import { staffFromRequest, type Staff } from "./session";

// Errors carry a code, a readable message and a request id (master plan 7.2).

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function error(status: number, code: string, message: string, requestId: string, details?: unknown) {
  return json(status, { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } });
}

/** Runs an editor mutation: same-origin check, session, JSON body validation, error mapping. */
export async function editorMutation<S extends z.ZodType>(
  request: Request,
  schema: S,
  run: (staff: Staff, input: z.infer<S>) => Promise<unknown>,
  successStatus = 200,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (!studioOrigins().trusted.includes(request.headers.get("origin") ?? "")) {
    return error(403, "bad_origin", "Заявката не идва от Studio.", requestId);
  }
  const staff = await staffFromRequest(request);
  if (!staff) return error(401, "unauthenticated", "Влезте отново.", requestId);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return error(400, "bad_json", "Невалидна заявка.", requestId);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return error(400, "invalid_input", "Невалидни данни.", requestId, parsed.error.issues.map((issue) => issue.message));
  }

  try {
    return json(successStatus, await run(staff, parsed.data));
  } catch (caught) {
    if (caught instanceof EditorError) return error(caught.status, caught.code, caught.message, requestId, caught.details);
    console.error(`[studio] ${requestId}`, caught);
    return error(500, "internal", "Нещо се обърка. Опитайте отново.", requestId);
  }
}
