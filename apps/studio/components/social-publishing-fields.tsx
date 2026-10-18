"use client";
import { useEffect, useState } from "react";
import { FACEBOOK_TEXT_MAX, normalizeSocial, type SocialInput, type SocialStatus } from "@newspoint/content";
import { callApi } from "@/lib/client-api";

export function SocialPublishingFields({ value, title, onChange, disabled, initialStatus, articleId, publishedRevision }: {
  value: SocialInput | undefined; title: string; onChange: (value: SocialInput) => void; disabled: boolean;
  initialStatus: SocialStatus; articleId: string | null; publishedRevision: number | null;
}) {
  const social = normalizeSocial(value, title);
  const [status, setStatus] = useState(initialStatus);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!articleId) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (document.visibilityState !== "hidden") {
        const result = await callApi<SocialStatus>("GET", `/api/editor/articles/${articleId}/social/`);
        if (!stopped && result.ok) {
          setStatus(result.data);
          if (result.data.job && ["succeeded", "cancelled", "failed"].includes(result.data.job.status)) return;
          if (!result.data.job && !social.facebook.enabled) return;
        }
      }
      if (!stopped) timer = setTimeout(() => void refresh(), 5000);
    };
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [articleId, publishedRevision, retrying, social.facebook.enabled]);
  async function retry() {
    if (!articleId || retrying) return;
    setRetrying(true); setError("");
    const result = await callApi<SocialStatus>("POST", `/api/editor/articles/${articleId}/social/`, { action: "retry" });
    if (result.ok) setStatus(result.data); else setError(result.error.message);
    setRetrying(false);
  }
  // Once external sending starts, edits must not imply changes to an already-sent Facebook post.
  const fixed = Boolean(status.job && !(status.job.status === "failed" && ["prepare", "photo"].includes(status.job.step)));
  return <section aria-labelledby="social-publishing-label" className="mt-3 border-t border-line pt-3 text-xs">
    <h3 id="social-publishing-label" className="mb-2 text-xs font-semibold text-muted">Публикувай в социални мрежи</h3>
    <label className="inline-flex items-center gap-2 text-ink">
      <input type="checkbox" checked={fixed ? true : social.facebook.enabled} disabled={disabled || !status.ready || fixed}
        onChange={event => onChange({ facebook: { ...social.facebook, enabled: event.target.checked } })} /> Facebook
    </label>
    {(fixed || social.facebook.enabled) && <textarea aria-label="Текст за Facebook" rows={3} maxLength={FACEBOOK_TEXT_MAX}
      className="np-input mt-2 block w-full resize-y text-sm" disabled={disabled || fixed}
      value={fixed ? status.job!.text : social.facebook.text}
      onChange={event => onChange({ facebook: { ...social.facebook, text: event.target.value, textMode: "custom" } })} />}
    <div aria-live="polite" className="mt-1 text-[11px] text-muted">
      {!status.ready ? "Facebook ще е достъпен след настройване от администратора." : status.job ? <>
        {status.job.message} {status.job.url && <a href={status.job.url} target="_blank" rel="noopener noreferrer" className="underline">Виж поста ↗</a>}
        {status.job.canRetry && <button type="button" className="ml-2 underline" disabled={disabled || retrying} onClick={() => void retry()}>{retrying ? "Изчакайте…" : "Опитай отново"}</button>}
      </> : social.facebook.enabled ? !status.connected ? "Новината ще се публикува в сайта. Facebook очаква свързване от администратора." : !status.enabled ? "Facebook е временно спрян от администратора." : "Ще се изпрати автоматично след публикуването на новината." : null}
      {error && <p role="alert">{error}</p>}
    </div>
  </section>;
}
