"use client";
import { useState } from "react";
import { callApi } from "@/lib/client-api";

export function SocialConnection({ ready, connection, pages, selection, problems, enabled }: {
  ready: boolean; connection: { name: string; status: string } | null; pages: { id: string; name: string }[]; selection: string;
  problems: { id: string; text: string; step: string; postId: string | null }[]; enabled: boolean;
}) {
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  async function act(body: unknown) {
    if (busy) return; setBusy(true); setNotice("");
    const result = await callApi<{ url?: string }>("POST", "/api/social/", body);
    if (!result.ok) { setNotice(result.error.message); setBusy(false); return; }
    if (result.data.url) window.location.assign(result.data.url);
    else window.location.assign("/admin/settings/social/");
  }
  return <div className="max-w-xl space-y-4">
    <h1 className="text-xl font-bold">Facebook</h1>
    {!ready ? <p>Първо приложете миграция 39.</p> : <>
      <p>{connection ? `${connection.name} · ${connection.status === "connected" ? "Свързана" : "Необходимо е свързване"}` : "Страницата още не е свързана."}</p>
      {!enabled && <p className="text-sm text-muted">Автоматичното изпращане е спряно в сървърната конфигурация.</p>}
      {pages.length ? <div className="flex flex-wrap items-center gap-2"><label>Страница <select className="np-input" value={pageId} onChange={e => setPageId(e.target.value)}>{pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <button className="np-btn np-btn-primary" disabled={busy} onClick={() => void act({ action: "select", selection, pageId })}>Свържи страницата</button></div> :
        <button className="np-btn np-btn-primary" disabled={busy} onClick={() => void act({ action: "connect" })}>{connection ? "Свържи отново Facebook" : "Свържи Facebook"}</button>}
      {connection?.status === "connected" && <button className="np-btn np-btn-secondary ml-2" disabled={busy} onClick={() => void act({ action: "disconnect" })}>Прекъсни връзката</button>}
      {problems.map(job => <details key={job.id} className="border-t border-line pt-2 text-sm"><summary>Проверка на непотвърден резултат: {job.text.slice(0, 80)}</summary>
        <p className="my-2 text-muted">Проверете във Facebook дали {job.step === "comment" ? "коментарът" : "снимковият пост"} съществува. Въведете неговия идентификатор, за да продължи задачата без повторно изпращане.</p>
        <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void act({ action: "reconcile", jobId: job.id, objectId: data.get("objectId") }); }}>
          <input aria-label="Facebook идентификатор" name="objectId" className="np-input" required pattern="[0-9]+(_[0-9]+)?" /> <button className="np-btn np-btn-secondary" disabled={busy}>Провери и продължи</button>
        </form></details>)}
    </>}
    {notice && <p role="alert">{notice}</p>}
  </div>;
}
