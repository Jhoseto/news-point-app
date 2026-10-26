import type { MediaOption } from "./articles";
import { UPLOADED_PHOTO_MAX_BYTES } from "@newspoint/content/upload-photo-limit";
import { withBase } from "./paths";

const UPLOAD_TIMEOUT_MS = 90_000;
const uncertainResult = "Връзката прекъсна или качването се забави. Проверете дали снимката вече е в медийната библиотека, преди да опитате отново.";

export function acceptedDevicePhotos(files: File[]): { accepted: File[]; rejected: File[] } {
  return {
    accepted: files.filter(file => file.size <= UPLOADED_PHOTO_MAX_BYTES),
    rejected: files.filter(file => file.size > UPLOADED_PHOTO_MAX_BYTES),
  };
}

export async function uploadDevicePhoto(file: File, name: string): Promise<MediaOption> {
  if (file.size > UPLOADED_PHOTO_MAX_BYTES) throw new Error("Снимката трябва да е до 25 MB.");
  const form = new FormData();
  form.append("file", file);
  form.append("alt", name.trim().slice(0, 240));

  let response: Response;
  try {
    response = await fetch(withBase("/api/editor/media/upload/"), {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch {
    // A lost response can follow a successful server write. Do not retry automatically.
    throw new Error(uncertainResult);
  }

  let payload: (MediaOption & { error?: { message?: string } }) | null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(uncertainResult);
  }
  if (!response.ok) throw new Error(payload?.error?.message ?? `Качването не беше успешно (HTTP ${response.status}).`);
  if (!payload?.id || !payload.url) throw new Error(uncertainResult);
  return payload;
}
