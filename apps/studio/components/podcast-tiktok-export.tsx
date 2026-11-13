"use client";

import { useId, useSyncExternalStore } from "react";
import { idlePodcastExportView, podcastExportView, podcastVideoUrl, startPodcastVideoDownload, subscribeToPodcastExports } from "./podcast-tiktok-client";

export function PodcastTikTokExport({ episodeId, revision, mediaKey, blockedReason }: {
  episodeId: string; revision: number; mediaKey: string; blockedReason?: string | undefined;
}) {
  const hintId = useId();
  const { job, busy, reconnecting, error } = useSyncExternalStore(
    subscribeToPodcastExports, () => podcastExportView(mediaKey), idlePodcastExportView,
  );

  const percent = job?.state === "rendering" || job?.state === "ready" ? job.percent : null;
  const hint = error || (reconnecting ? "Възстановяване на връзката със студиото…"
    : job?.state === "ready" ? "Видеото е готово. Ако изтеглянето не започне, използвай връзката."
    : busy ? (job?.state === "rendering" ? "Създаване на видео. Остави Studio отворено за автоматично изтегляне." : "Подготвяме обложката и звука…")
    : blockedReason || "Вертикално MP4 с обложката и звука на епизода.");
  return <div className="np-podcast-tiktok">
    <div className="np-podcast-social-actions">
      <button type="button" className="np-podcast-social-button np-podcast-tiktok-button focus-visible:outline-ink"
        disabled={busy || Boolean(blockedReason)} aria-busy={busy} aria-describedby={hintId}
        data-help="Създава вертикално видео 9:16 с обложката и звука на този епизод и го изтегля на устройството."
        onClick={() => void startPodcastVideoDownload(mediaKey, episodeId, revision)}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <rect x="5" y="2" width="14" height="20" rx="3" /><path d="M9 11v2m3-5v8m3-6v4" />
        </svg>
        TikTok версия
      </button>
      {job?.state === "ready" && <a className="np-podcast-social-link" href={podcastVideoUrl(episodeId, job.jobId, true)} download>Изтегли MP4</a>}
    </div>
    {percent !== null && <div className="np-podcast-tiktok-progress">
      <progress max="100" value={percent} aria-label="Създаване на TikTok видео" />
      <span aria-hidden="true">{percent}%</span>
    </div>}
    <p id={hintId} role={error ? "alert" : "status"} className={`np-podcast-social-note${error ? " np-podcast-social-note--error" : ""}`}>{hint}</p>
  </div>;
}
