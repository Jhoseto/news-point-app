"use client";

import { useState } from "react";
import { withBase } from "@/lib/paths";
import { EditorDialog } from "./editor-dialog";

export function VideoUploadDialog({ onUploaded, onClose }: { onUploaded: (url: string) => void; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async () => {
    if (!file || busy) return;
    if (file.size > 200 * 1024 * 1024) { setError("Видеото трябва да е до 200 MB."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(withBase("/api/editor/video/upload/"), {
        method: "POST",
        headers: { "content-type": file.type || ({ mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska" }[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream"), "x-video-name": encodeURIComponent(file.name.replace(/\.[^.]+$/, "")) },
        body: file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? "Качването не успя.");
      onUploaded(result.url);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Качването не успя."); }
    finally { setBusy(false); }
  };
  return <EditorDialog label="Качване на видео" onClose={busy ? () => undefined : onClose}>
    <h3>Качи собствено видео</h3>
    <p>До 5 минути и 200 MB. Приемаме MP4, MOV, WebM и MKV. Видеото се проверява и оптимизира за уеб преди да бъде добавено.</p>
    <label className="mt-4 block">Видео файл<input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mkv,.mov" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setError(""); }} className="np-input mt-2 w-full" /></label>
    {busy ? <p role="status" className="mt-3 text-sm">Качване и оптимизация… Това може да отнеме няколко минути.</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
    <div className="mt-4 flex gap-2"><button type="button" className="np-btn np-btn-primary" disabled={!file || busy} onClick={() => void upload()}>Качи и добави</button><button type="button" className="np-btn np-btn-secondary" disabled={busy} onClick={onClose}>Отказ</button></div>
  </EditorDialog>;
}
