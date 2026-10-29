"use client";
import { useEffect, useState } from "react";
import { FACEBOOK_TEXT_MAX, normalizeSocial, type SocialInput, type SocialStatus } from "@newspoint/content";
import { callApi } from "@/lib/client-api";
import { InstagramPublishingFields } from "./instagram-publishing-fields";

export function SocialPublishingFields({ value, title, body, onChange, disabled, initialStatus, articleId, publishedRevision }: {
  value: SocialInput | undefined; title: string; body: unknown; onChange: (value: SocialInput) => void; disabled: boolean;
  initialStatus: SocialStatus; articleId: string | null; publishedRevision: number | null;
}) {
  const social = normalizeSocial(value, title, body);
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
  const hint = !status.ready
    ? "След настройка от администратора."
    : status.job
      ? status.job.message
      : social.facebook.enabled
        ? !status.connected
          ? "Очаква свързване от администратора."
          : !status.enabled
            ? "Временно спрян от администратора."
            : "След публикуване в сайта."
        : "";
  return <>
    <label data-help="Изпраща тази новина към свързаната Facebook страница след публикуването ѝ в сайта." className="studio-meta-field">
      <span id="social-publishing-label">Мрежа</span>
      <input type="checkbox" className="size-3.5 shrink-0" checked={fixed ? true : social.facebook.enabled} disabled={disabled || !status.ready || fixed}
        onChange={event => onChange({ ...social, facebook: { ...social.facebook, enabled: event.target.checked } })} />
      <span aria-live="polite" className="studio-meta-note">{hint ? `Facebook · ${hint}` : "Facebook"}</span>
      {status.job?.url ? <a href={status.job.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[10px] font-bold normal-case tracking-normal text-accent underline">Пост</a> : null}
      {status.job?.canRetry ? <button data-help="Повтаря неуспешната стъпка на изпращането. Следете показания резултат." type="button" className="shrink-0 text-[10px] font-bold normal-case tracking-normal underline" disabled={disabled || retrying} onClick={() => void retry()}>{retrying ? "…" : "Отново"}</button> : null}
    </label>
    {(fixed || social.facebook.enabled) ? <label className="studio-meta-field">
      <span>Текст</span>
      <input data-help="Текстът за Facebook поста. След първа ръчна промяна той вече не следва автоматично заглавието." aria-label="Текст за Facebook" maxLength={FACEBOOK_TEXT_MAX}
        className="np-input min-w-0 flex-1" disabled={disabled || fixed}
        value={fixed ? status.job!.text : social.facebook.text}
        onChange={event => onChange({ ...social, facebook: { ...social.facebook, text: event.target.value, textMode: "custom" } })} />
    </label> : null}
    {error ? <p role="alert" className="studio-meta-field-span text-[10px] text-danger">{error}</p> : null}
    <InstagramPublishingFields value={social} title={title} body={body} onChange={onChange} disabled={disabled} articleId={articleId} publishedRevision={publishedRevision} initialStatus={initialStatus.instagram}/>
  </>;
}
