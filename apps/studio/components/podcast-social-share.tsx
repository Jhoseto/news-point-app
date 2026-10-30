"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SocialStatus } from "@newspoint/content";
import { withBase } from "../lib/paths";
import { isPodcastSharePending, podcastFacebookPostUrl, podcastShareControl, PODCAST_SOCIAL_POLL_MS, shouldPollPodcastShare } from "./podcast-social-state";
import "./podcast-social-share.css";

async function result(response: Response): Promise<SocialStatus> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || "Не успяхме да проверим споделянето. Опитай отново.");
  if (!data || typeof data.ready !== "boolean" || typeof data.connected !== "boolean" || typeof data.enabled !== "boolean"
    || !(data.job === null || (typeof data.job?.status === "string" && typeof data.job?.message === "string"))) {
    throw new Error("Състоянието на споделянето не беше потвърдено. Провери отново.");
  }
  return data as SocialStatus;
}

/** Only an explicit share/retry click mutates. Refresh, polling and recovery are GET-only. */
export function PodcastSocialShare({ episodeId, revision, blockedReason }: {
  episodeId: string; revision: number; blockedReason?: string | undefined;
}) {
  const [status, setStatus] = useState<SocialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pollingPaused, setPollingPaused] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const hintId = useId();
  const posting = useRef(false);
  const cancelRead = useRef<() => void>(() => {});
  const postController = useRef<AbortController | null>(null);
  const url = withBase(`/api/podcasts/${episodeId}/social/`);

  useEffect(() => {
    posting.current = false;
    setSubmitting(false);
    setStatus(null);
    setError("");
    return () => { postController.current?.abort(); posting.current = false; };
  }, [episodeId, revision]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const startedAt = Date.now();
    setLoading(true);
    setPollingPaused(false);
    const stop = () => { stopped = true; clearTimeout(timer); controller.abort(); };
    cancelRead.current = stop;

    async function load() {
      try {
        const next = await result(await fetch(url, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) }));
        if (stopped) return;
        setStatus(next);
        setLoading(false);
        if (shouldPollPodcastShare(next, startedAt, Date.now())) timer = setTimeout(() => void load(), PODCAST_SOCIAL_POLL_MS);
        else setPollingPaused(isPodcastSharePending(next));
      } catch (caught) {
        if (stopped) return;
        setLoading(false);
        setError(caught instanceof Error && caught.name !== "TimeoutError" && caught.name !== "TypeError" ? caught.message : "Не получихме състоянието. Провери статуса отново.");
      }
    }
    void load();
    return stop;
  }, [url, revision, refresh]);

  const control = podcastShareControl({ status, loading, submitting, blockedReason, error, pollingPaused });
  const postUrl = podcastFacebookPostUrl(status?.job?.url);

  async function act() {
    if (!control.action || posting.current) return;
    if (control.action === "check") {
      setError("");
      setRefresh(value => value + 1);
      return;
    }
    posting.current = true;
    cancelRead.current();
    const controller = new AbortController();
    postController.current = controller;
    setSubmitting(true);
    setError("");
    try {
      const next = await result(await fetch(url, {
        method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: control.action, revision }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      }));
      if (controller.signal.aborted) return;
      setStatus(next);
      setPollingPaused(false);
      if (isPodcastSharePending(next)) setRefresh(value => value + 1);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error && caught.name !== "TimeoutError" && caught.name !== "TypeError"
        ? caught.message : "Не получихме потвърждение. Провери статуса, преди да опиташ отново.");
    } finally {
      posting.current = false;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  }

  return <div className="np-podcast-social">
    <div className="np-podcast-social-actions">
      <button type="button" className="np-podcast-social-button" disabled={!control.action} aria-describedby={hintId}
        aria-busy={Boolean(control.busy)} onClick={() => void act()}
        data-help="Споделя записаните обложка, заглавие и кратко резюме в свързаните Facebook страници. Линкът към епизода е в първия коментар.">
        {control.busy ? <svg className="np-podcast-social-spinner" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="35 16" /></svg>
          : <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M14 21v-8h3l.5-4H14V7c0-1.2.4-2 2-2h2V1.5A22 22 0 0 0 15 1c-3.2 0-5 2-5 5.5V9H7v4h3v8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        {control.label}
      </button>
      {postUrl ? <a className="np-podcast-social-link" href={postUrl} target="_blank" rel="noopener noreferrer">Отвори поста</a> : null}
    </div>
    <p id={hintId} role={error ? "alert" : "status"} className={`np-podcast-social-note${error ? " np-podcast-social-note--error" : ""}`}>{control.hint}</p>
  </div>;
}
