import { withBase } from "../lib/paths";
import type { PodcastTikTokStatus } from "../lib/podcast-tiktok-jobs";

export function podcastVideoUrl(episodeId: string, jobId?: string, download = false) {
  const endpoint = withBase(`/api/podcasts/${encodeURIComponent(episodeId)}/tiktok/`);
  if (!jobId) return endpoint;
  return endpoint + "?" + new URLSearchParams(download ? { job: jobId, download: "1" } : { job: jobId });
}

class ExportResponseError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function exportExpired(error: unknown) {
  return error instanceof ExportResponseError && error.status === 404;
}

async function readStatus(response: Response, jobId?: string): Promise<PodcastTikTokStatus> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ExportResponseError(typeof data?.error?.message === "string" ? data.error.message
      : "Връзката със студиото е прекъсната. Опитай отново.", response.status);
  }
  if (!data || typeof data.jobId !== "string" || !data.jobId || (jobId && data.jobId !== jobId)
    || !["preparing", "rendering", "ready", "failed"].includes(data.state)
    || !Number.isInteger(data.percent) || data.percent < 0 || data.percent > 100
    || (data.message !== undefined && typeof data.message !== "string")
    || (data.state === "ready") !== (data.percent === 100)) {
    throw new Error("Не получихме потвърждение за състоянието на видеото. Опитай отново.");
  }
  return data;
}

/** A lost poll only repeats the read. A lost start is recovered by the server's revision deduplication. */
export async function followPodcastVideo(options: {
  episodeId: string;
  revision: number;
  resumeJobId?: string | undefined;
  signal: AbortSignal;
  onStatus: (status: PodcastTikTokStatus) => void;
  onReconnect: () => void;
}) {
  const { episodeId, revision, signal } = options;
  let jobId = options.resumeJobId;
  let retries = 0;
  while (!signal.aborted) {
    try {
      const response = await fetch(podcastVideoUrl(episodeId, jobId), {
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        ...(!jobId && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision }) }),
      });
      const status = await readStatus(response, jobId);
      signal.throwIfAborted();
      options.onStatus(status);
      if (status.state === "ready" || status.state === "failed") return status;
      jobId = status.jobId;
      retries = 0;
    } catch (error) {
      signal.throwIfAborted();
      const transient = error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError")
        || (error instanceof ExportResponseError && error.status >= 500);
      if (!jobId || !transient || retries >= 3) {
        if (transient) throw new Error("Връзката със студиото е прекъсната. Опитай отново.");
        throw error;
      }
      retries++;
      options.onReconnect();
    }
    await new Promise(resolve => setTimeout(resolve, 1_500 * (1 + retries)));
  }
  throw signal.reason;
}

type ExportView = {
  job: PodcastTikTokStatus | null;
  busy: boolean;
  reconnecting: boolean;
  error: string;
};
const idle: ExportView = { job: null, busy: false, reconnecting: false, error: "" };

// Tab-local tasks belong to the click that started them. Navigating within Studio
// only changes subscribers; mounting or reading the store never starts a download.
const exportsByMedia = new Map<string, ExportView>();
const listeners = new Set<() => void>();
export function subscribeToPodcastExports(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function podcastExportView(key: string) { return exportsByMedia.get(key) ?? idle; }
export function idlePodcastExportView() { return idle; }

export async function startPodcastVideoDownload(key: string, episodeId: string, revision: number) {
  const previous = podcastExportView(key);
  if (previous.busy) return;
  function update(patch: Partial<ExportView>) {
    exportsByMedia.set(key, { ...podcastExportView(key), ...patch });
    for (const listener of listeners) listener();
  }
  const resume = previous.job?.state === "preparing" || previous.job?.state === "rendering" ? previous.job : null;
  update({ job: resume, busy: true, reconnecting: false, error: "" });
  try {
    const result = await followPodcastVideo({
      episodeId, revision, resumeJobId: resume?.jobId, signal: new AbortController().signal,
      onStatus: job => update({ job, reconnecting: false }),
      onReconnect: () => update({ reconnecting: true }),
    });
    if (result.state === "failed") {
      update({ error: result.message || "Видеото не беше създадено. Опитай отново." });
      return;
    }
    const link = document.createElement("a");
    link.href = podcastVideoUrl(episodeId, result.jobId, true);
    link.download = "";
    document.body.append(link);
    link.click();
    link.remove();
  } catch (error) {
    update({ ...(exportExpired(error) && { job: null }),
      error: error instanceof Error ? error.message : "Не успяхме да подготвим видеото. Опитай отново." });
  } finally {
    update({ busy: false, reconnecting: false });
    const finished = exportsByMedia.get(key);
    setTimeout(() => {
      if (exportsByMedia.get(key) !== finished) return;
      exportsByMedia.delete(key);
      for (const listener of listeners) listener();
    }, 60 * 60_000);
  }
}
