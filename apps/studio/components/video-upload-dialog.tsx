"use client";
import { useState } from "react";
import { EditorDialog } from "./editor-dialog";
import { cancelResumableUpload, uploadResumable } from "@/lib/resumable-upload";
export function VideoUploadDialog({ onUploaded, onClose }: { onUploaded: (url: string) => void; onClose: () => void }) {
 const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [progress, setProgress] = useState("");
 const upload = async () => {
  if (!file || busy) return;
  if (file.size > 200 * 1024 * 1024 || file.size < 1) { setError("Видеото трябва да е до 200 MiB."); return; }
  setBusy(true); setError("");
  try { const result = await uploadResumable("video", [{ key: "video", file }], {}, setProgress); onUploaded(result.url); }
  catch (problem) { setError(problem instanceof Error ? problem.message : "Качването е прекъснато."); }
  finally { setBusy(false); }
 };
 const cancel = async () => { try { await cancelResumableUpload("video"); setProgress("Качването е отменено."); if (!busy) onClose(); } catch (problem) { setError(problem instanceof Error ? problem.message : "Отмяната не успя."); } };
 return <EditorDialog label="Качване на видео" onClose={busy ? () => undefined : onClose}>
  <h3>Качи собствено видео</h3><p>До 5 минути и 200 MiB. MP4, MOV, WebM или MKV. Качването е на части, после видеото се оптимизира.</p>
  <p className="mt-2 text-sm">При прекъсване изберете същия файл и натиснете отново. Получените части се пазят 24 часа.</p>
  <label className="mt-4 block">Видео файл<input data-help="Избира видео файл от компютъра. Изчакайте качването, преди да го добавите." type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mkv,.mov" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setError(""); }} className="np-input mt-2 w-full" /></label>
  {progress ? <p role="status" className="mt-3 text-sm">{progress}</p> : null}{error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
  <div className="mt-4 flex gap-2"><button data-help="Качва избраното видео и го добавя на избраното място в материала." type="button" className="np-btn np-btn-primary" disabled={!file || busy} onClick={() => void upload()}>Качи и добави</button><button data-help="Отменя текущото качване на видео." type="button" className="np-btn np-btn-secondary" onClick={() => void cancel()}>Отмени качването</button></div>
 </EditorDialog>;
}
