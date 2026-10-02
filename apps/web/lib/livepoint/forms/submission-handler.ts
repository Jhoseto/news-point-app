import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { hashIp } from "../serialize";
import { preparePhotos } from "./photo-processing";
import { uploadPhotos, removePhotos } from "./photo-storage";
import type { SubmissionPhoto } from "./photos";
import { readSubmission, reserveSubmission, SubmissionRequestError } from "./submission-request";
import type { SubmissionResult } from "./store";

const headers = { "Cache-Control": "private, no-store" };
export async function handleSubmission<T>(request: Request, schema: z.ZodType<T>, save: (input: T, meta: { ipHash: string | null; userAgent: string | null }, photos: SubmissionPhoto[]) => Promise<SubmissionResult>, validationMessage?: (path: PropertyKey | undefined) => string) {
  let release: (() => void) | undefined;
  let uploaded: SubmissionPhoto[] = [];
  let persisted = false;
  try {
    release = reserveSubmission(request);
    const { input, photos } = await readSubmission(request);
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new SubmissionRequestError(validationMessage?.(parsed.error.issues[0]?.path[0]) ?? "Проверете полетата на формата.");
    let prepared;
    try { prepared = await preparePhotos(photos); }
    catch (error) { throw new SubmissionRequestError(error instanceof Error ? error.message : "Невалидна снимка."); }
    try { uploaded = await uploadPhotos(prepared); }
    catch { throw new SubmissionRequestError("Снимките не можаха да се запазят. Опитайте отново по-късно. Формата не е изпратена.", 503); }
    const result = await save(parsed.data, {
      ipHash: hashIp(request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? null),
      userAgent: request.headers.get("user-agent")?.slice(0, 1000) ?? null,
    }, uploaded);
    if (!result.ok) throw new SubmissionRequestError(result.error, result.code === "unavailable" ? 503 : 500);
    persisted = true;
    return NextResponse.json({ ok: true, reference: result.reference, id: result.id }, { headers });
  } catch (error) {
    const status = error instanceof SubmissionRequestError ? error.status : 500;
    const message = error instanceof SubmissionRequestError ? error.message : "Формата не беше приета. Опитайте отново.";
    return NextResponse.json({ ok: false, error: message }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) } });
  } finally {
    if (!persisted && uploaded.length) {
      try { await removePhotos(uploaded); }
      catch { console.error("LivePoint submission photo rollback failed", { paths: uploaded.map(photo => photo.path) }); }
    }
    release?.();
  }
}
