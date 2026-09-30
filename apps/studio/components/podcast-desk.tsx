"use client";

import { useState } from "react";
import { withBase } from "@/lib/paths";

export type StudioEpisode = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  coverKey: string;
  durationSec: number;
  bytes: number;
  categoryId: string | null;
  categoryName: string | null;
  status: "draft" | "published";
  publishedAt: string | null;
};

type Category = { id: string; name: string };

function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function PodcastDesk({ initial, categories, webUrl }: { initial: StudioEpisode[]; categories: Category[]; webUrl: string }) {
  const [episodes, setEpisodes] = useState(initial);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<string | null>(initial[0]?.id ?? null);
  const current = episodes.find((episode) => episode.id === selected) ?? null;

  async function send(body: unknown) {
    const response = await fetch(withBase("/api/podcasts/"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message ?? "Записът не мина.");
  }

  async function upload(form: FormData) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(withBase("/api/podcasts/upload/"), { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message ?? "Качването не мина.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Качването не мина.");
      setPending(false);
    }
  }

  async function act(action: "publish" | "hide" | "save", episode: StudioEpisode, fields?: { title: string; summary: string; categoryId: string | null }) {
    setPending(true);
    setMessage("");
    try {
      if (action === "save" && fields) await send({ action: "save", id: episode.id, ...fields });
      else await send({ action, id: episode.id });
      setEpisodes((rows) => rows.map((row) => {
        if (row.id !== episode.id) return row;
        if (action === "publish") return { ...row, status: "published", publishedAt: row.publishedAt ?? new Date().toISOString() };
        if (action === "hide") return { ...row, status: "draft" };
        return fields ? { ...row, ...fields, categoryName: categories.find((item) => item.id === fields.categoryId)?.name ?? null } : row;
      }));
      setMessage(action === "publish" ? "Епизодът е на сайта." : action === "hide" ? "Епизодът е скрит." : "Записано е.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Записът не мина.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-line bg-surface p-3">
        <h2 className="px-2 py-2 text-xs font-bold tracking-wide text-muted uppercase">Епизоди</h2>
        {episodes.length ? (
          <ul className="flex flex-col">
            {episodes.map((episode) => (
              <li key={episode.id}>
                <button type="button" onClick={() => setSelected(episode.id)} aria-current={episode.id === selected ? "true" : undefined} className="flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2 aria-[current=true]:bg-surface-2">
                  <span className="line-clamp-2 text-sm font-bold text-ink">{episode.title}</span>
                  <span className="text-xs text-muted">{episode.status === "published" ? "На сайта" : "Чернова"} · {clock(episode.durationSec)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="px-2 py-4 text-sm text-muted">Още няма епизоди.</p>}
      </section>

      <div className="flex flex-col gap-6">
        <form className="rounded-2xl border border-line bg-surface p-5" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          form.set("publish", submitter instanceof HTMLButtonElement ? submitter.value : "0");
          void upload(form);
        }}>
          <h2 className="text-lg font-extrabold text-ink">Нов епизод</h2>
          <p className="mt-1 text-sm text-muted">Заглавие, кратко резюме, корица и MP3. Продължителността се смята сама.</p>
          <label className="mt-4 block text-sm font-semibold text-ink">Заглавие
            <input name="title" required minLength={2} maxLength={180} className="mt-1 h-11 w-full rounded-xl border border-line bg-page px-3 text-sm" />
          </label>
          <label className="mt-3 block text-sm font-semibold text-ink">Резюме
            <textarea name="summary" required maxLength={600} rows={3} className="mt-1 w-full rounded-xl border border-line bg-page px-3 py-2 text-sm" />
          </label>
          <label className="mt-3 block text-sm font-semibold text-ink">Рубрика
            <select name="categoryId" className="mt-1 h-11 w-full rounded-xl border border-line bg-page px-3 text-sm" defaultValue="">
              <option value="">Без рубрика</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-ink">Корица
              <input name="cover" type="file" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full text-sm" />
            </label>
            <label className="text-sm font-semibold text-ink">MP3 до 80 MB
              <input name="audio" type="file" accept="audio/mpeg,.mp3" required className="mt-1 block w-full text-sm" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" value="1" disabled={pending} className="np-gradient-bg inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-white disabled:opacity-50">Публикувай</button>
            <button type="submit" value="0" disabled={pending} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold text-ink disabled:opacity-50">Запиши чернова</button>
          </div>
        </form>

        {current ? <EpisodeEditor key={current.id} episode={current} categories={categories} webUrl={webUrl} pending={pending} onAct={act} /> : null}
        {message ? <p role="status" className="text-sm font-semibold text-ink">{message}</p> : null}
      </div>
    </div>
  );
}

function EpisodeEditor({ episode, categories, webUrl, pending, onAct }: {
  episode: StudioEpisode;
  categories: Category[];
  webUrl: string;
  pending: boolean;
  onAct: (action: "publish" | "hide" | "save", episode: StudioEpisode, fields?: { title: string; summary: string; categoryId: string | null }) => Promise<void>;
}) {
  const [title, setTitle] = useState(episode.title);
  const [summary, setSummary] = useState(episode.summary);
  const [categoryId, setCategoryId] = useState(episode.categoryId ?? "");
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex gap-4">
        <img src={`${webUrl}/media/${episode.coverKey}`} alt="" className="size-20 rounded-xl object-cover" />
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wide text-muted uppercase">{episode.status === "published" ? "На сайта" : "Чернова"} · {clock(episode.durationSec)}</p>
          <p className="mt-1 truncate text-sm text-muted">{episode.slug}</p>
        </div>
      </div>
      <label className="mt-4 block text-sm font-semibold text-ink">Заглавие
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} className="mt-1 h-11 w-full rounded-xl border border-line bg-page px-3 text-sm" />
      </label>
      <label className="mt-3 block text-sm font-semibold text-ink">Резюме
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={600} rows={3} className="mt-1 w-full rounded-xl border border-line bg-page px-3 py-2 text-sm" />
      </label>
      <label className="mt-3 block text-sm font-semibold text-ink">Рубрика
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line bg-page px-3 text-sm">
          <option value="">Без рубрика</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => void onAct("save", episode, { title: title.trim(), summary: summary.trim(), categoryId: categoryId || null })} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold text-ink disabled:opacity-50">Запиши текста</button>
        {episode.status === "published"
          ? <button type="button" disabled={pending} onClick={() => void onAct("hide", episode)} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold text-ink disabled:opacity-50">Скрий</button>
          : <button type="button" disabled={pending} onClick={() => void onAct("publish", episode)} className="np-gradient-bg inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-white disabled:opacity-50">Публикувай</button>}
      </div>
    </section>
  );
}
