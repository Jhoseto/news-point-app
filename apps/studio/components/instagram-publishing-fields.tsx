"use client";
import { useEffect, useState } from "react";
import { INSTAGRAM_TEXT_MAX, normalizeInstagram, type SocialInput, type SocialStatus } from "@newspoint/content";
import { callApi } from "@/lib/client-api";
export function InstagramPublishingFields({ value, title, onChange, disabled, articleId, publishedRevision, initialStatus }: {
    value: SocialInput;
    title: string;
    onChange: (value: SocialInput) => void;
    disabled: boolean;
    articleId: string | null;
    publishedRevision: number | null;
    initialStatus?: SocialStatus | undefined;
}) {
    const instagram = normalizeInstagram(value.instagram, title);
    const [status, setStatus] = useState<SocialStatus | null>(initialStatus ?? null);
    const [retrying, setRetrying] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        if (!articleId)
            return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        async function refresh() {
            if (document.visibilityState !== "hidden") {
                const result = await callApi<SocialStatus>("GET", `/api/editor/articles/${articleId}/instagram/`);
                if (!stopped && result.ok) {
                    setStatus(result.data);
                    if (result.data.job && ["succeeded", "cancelled", "failed", "uncertain"].includes(result.data.job.status))
                        return;
                    if (!result.data.job && !instagram.enabled)
                        return;
                }
            }
            if (!stopped)
                timer = setTimeout(() => void refresh(), 5000);
        }
        void refresh();
        return () => { stopped = true; clearTimeout(timer); };
    }, [articleId, publishedRevision, instagram.enabled, retrying]);
    async function retry() {
        if (!articleId || retrying)
            return;
        setRetrying(true);
        setError("");
        const result = await callApi<SocialStatus>("POST", `/api/editor/articles/${articleId}/instagram/`, { action: "retry" });
        if (result.ok)
            setStatus(result.data);
        else
            setError(result.error.message);
        setRetrying(false);
    }
    const fixed = Boolean(status?.job && status.job.status !== "failed");
    const hint = status?.job ? status.job.message : !status ? "Проверка…" : !status.ready ? "След настройка от администратора." :
        !status.connected ? "Очаква свързване от администратора." : !status.enabled ? "Временно спрян от администратора." : instagram.enabled ? "След публикуване в сайта." : "";
    return <>
    <label className="studio-meta-field" data-help="Отделен Instagram пост със снимка и текст след публикуването на тази новина. Линковете в описанието не са бутон към статията.">
      <span>Мрежа</span>
      <input type="checkbox" className="size-3.5 shrink-0" aria-label="Публикуване в Instagram" checked={fixed ? true : instagram.enabled} disabled={disabled || fixed || !status?.ready} onChange={e => onChange({ ...value, instagram: { ...instagram, enabled: e.target.checked } })}/>
      <span aria-live="polite" className="studio-meta-note">{hint ? `Instagram · ${hint}` : "Instagram"}</span>
      {status?.job?.url ? <a href={status.job.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[10px] font-bold normal-case tracking-normal text-accent underline">Пост</a> : null}
      {status?.job?.canRetry ? <button type="button" className="shrink-0 text-[10px] font-bold normal-case tracking-normal underline" disabled={disabled || retrying} onClick={() => void retry()}>{retrying ? "…" : "Отново"}</button> : null}
    </label>
    {(fixed || instagram.enabled) ? <label className="studio-meta-field"><span>Текст</span>
      <input aria-label="Текст за Instagram" maxLength={INSTAGRAM_TEXT_MAX} className="np-input min-w-0 flex-1" disabled={disabled || fixed} value={fixed ? status!.job!.text : instagram.text} onChange={e => onChange({ ...value, instagram: { ...instagram, text: e.target.value, textMode: "custom" } })}/>
    </label> : null}
    {error ? <p role="alert" className="studio-meta-field-span text-[10px] text-danger">{error}</p> : null}
  </>;
}
