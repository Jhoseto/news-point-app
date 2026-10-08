const ACCEPTED_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function pasteFileName(file: File): string {
  if (file.name && file.name !== "image.png" && file.name !== "blob" && !file.name.startsWith("image.")) return file.name;
  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "png";
  return `paste-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
}

function normalizePasteFile(file: File): File {
  const type = ACCEPTED_UPLOAD_TYPES.has(file.type) ? file.type : file.type.startsWith("image/") ? file.type : "image/png";
  const name = pasteFileName(file);
  return name === file.name && type === file.type ? file : new File([file], name, { type, lastModified: Date.now() });
}

/** Collect image files from a paste/drop DataTransfer. */
export function imageFilesFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file && (ACCEPTED_UPLOAD_TYPES.has(file.type) || file.type.startsWith("image/"))) out.push(normalizePasteFile(file));
  }
  if (out.length) return out;
  for (const file of Array.from(data.files ?? [])) {
    if (ACCEPTED_UPLOAD_TYPES.has(file.type) || file.type.startsWith("image/")) out.push(normalizePasteFile(file));
  }
  return out;
}
