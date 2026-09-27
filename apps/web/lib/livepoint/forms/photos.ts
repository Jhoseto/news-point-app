export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const extensions: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"],
};

export function photoSelectionError(files: readonly { name: string; size: number; type: string }[]): string | null {
  if (files.length > MAX_PHOTOS) return "Можете да прикачите най-много 5 снимки.";
  for (const file of files) {
    if (!file.size || file.size > MAX_PHOTO_BYTES) return "Всяка снимка трябва да е до 10 MB и да не е празна.";
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!extensions[file.type]?.includes(extension)) return "Приемат се само снимки във формат JPEG, PNG или WebP.";
  }
  return null;
}

export function submissionFormData(input: unknown, photos: readonly File[]): FormData {
  const body = new FormData();
  body.set("data", JSON.stringify(input));
  for (const photo of photos) body.append("photos", photo);
  return body;
}

export type SubmissionPhoto = {
  bucket: string; path: string; contentType: "image/webp"; bytes: number;
  width: number; height: number;
};
