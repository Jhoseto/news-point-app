"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AI_PODCAST_VOICES, scriptWords, targetWords, transcript, type AiPodcastSegment, type AiPodcastSettings, type AiPodcastSource, type AiPodcastWarning } from "@newspoint/content";
import { withBase } from "@/lib/paths";
import type { Category } from "./podcast-desk-types";
import "./ai-podcast-studio.css";

type Project = {
  id: string; title: string | null; summary: string | null; status: string; revision: number;
  settings: AiPodcastSettings; sources: AiPodcastSource[]; segments: AiPodcastSegment[];
  warnings: AiPodcastWarning[]; musicAssetId: string | null; coverKey: string | null;
};
type ProjectItem = Pick<Project, "id" | "title" | "status"> & { episodeId: string | null; createdAt: string };
type Progress = { stage: string; completed?: number; total?: number };
type Job = { id: string; kind: string; status: string; error: string | null; attempts: number; createdAt: string; updatedAt: string; payload?: { remixOnly?: boolean }; usage?: { progress?: Progress; voices?: { alex: string; maya: string }; durationWarning?: boolean; durationSec?: number; targetSeconds?: number; tempo?: number; musicAssetId?: string | null } };
type Episode = { audioKey: string; coverKey: string; durationSec: number; status: string };
type Article = { id: string; title: string };
type Asset = { id: string; kind: string; preset: string | null; status: string; storageKey: string; prompt: string };
type Voice = { alexVoice: string; mayaVoice: string } | null;
type Mode = "studio" | "library" | "music";
type Panel = "script" | "production";

const defaults: AiPodcastSettings = { articleIds: [], minutes: 10, style: "natural", introMode: "automatic", intro: "", direction: "", music: "none", categoryId: null };
const statusText: Record<string, string> = { new: "Нов", scripting: "Подготвя се сценарий", review: "За редакторски преглед", producing: "Произвежда се аудио", ready: "Готова аудио чернова", failed: "Нужна е намеса" };
const jobText: Record<string, string> = { script: "Сценарий", check: "Проверка на факти", produce: "Озвучаване и MP3", segment: "Повторно озвучаване", cover: "Обложка", music: "Музика" };
const jobStatus: Record<string, string> = { queued: "Чака", running: "Работи", succeeded: "Готово", failed: "Грешка", cancelled: "Отменено" };
function jobLabel(job: Job) { return job.kind === "produce" && job.payload?.remixOnly ? "Смесване с музика" : jobText[job.kind] || job.kind; }

async function api<T>(query = "", action?: Record<string, unknown>): Promise<T> {
  const response = await fetch(withBase(`/api/podcasts/ai${query}`), action ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action) } : { cache: "no-store" });
  const data = await response.json().catch(() => ({ error: "Сървърът не върна валиден отговор." }));
  if (!response.ok) throw new Error(data.error || "Заявката не успя.");
  return data as T;
}

function media(key: string) { return withBase(`/api/podcasts/ai/media?key=${encodeURIComponent(key)}`); }
function durationLabel(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
function suggestedMusicPrompt(project: Project) {
  const mood = project.settings.style === "serious" ? "сдържан и сериозен" : project.settings.style === "dynamic" ? "динамичен, но ненатрапчив" : project.settings.style === "analytical" ? "спокоен и аналитичен" : "топъл и съвременен";
  return `${mood} инструментален фон за новинарски подкаст. Без вокали, говор и драматични ефекти. Подходящ за темите: ${project.sources.map((source) => source.title).join("; ")}.`.slice(0, 900);
}
function humanError(value: string | null) {
  if (!value) return "Задачата не успя. Проверете настройките и опитайте отново.";
  if (value.includes("Brand voices are not approved")) return "Липсват одобрени гласове. Администраторът трябва да избере гласове за Алекс и Мая в „Музикална библиотека“.";
  if (value.includes("Music") && value.includes("is not ready")) return "Избраната музика още не е готова. Проверете библиотеката или генерирайте нова.";
  if (value === "fetch failed") return "Външната заявка прекъсна. Проверете връзката и сертификатите на worker-а, после повторете задачата.";
  if (value.startsWith("Gemini connection failed")) return `Връзката с Gemini прекъсна. Проверете мрежата и системните сертификати на worker-а, после повторете задачата. ${value}`;
  if (value.startsWith("Final duration")) return "Старият опит е спрял заради продължителността. Повторете задачата: новият мастер коригира малки отклонения и запазва чернова при по-големи.";
  return value;
}
function editorialText(segments: AiPodcastSegment[]) { return segments.map(({ id, sourceId, label, lines }) => ({ id, sourceId, label, lines: lines.map(({ speaker, text, direction }) => ({ speaker, text, direction })) })); }
function move<T>(items: T[], index: number, step: number) { const next = [...items]; const target = index + step; if (target < 0 || target >= next.length) return items; [next[index], next[target]] = [next[target]!, next[index]!]; return next; }

function Monitor({ project, job, jobs, message, error, nextStep, busy, onRetry, onCancel }: {
  project: Project | null; job: Job | undefined; jobs: Job[]; message: string; error: string; nextStep: string; busy: boolean;
  onRetry: (id: string) => void; onCancel: (id: string) => void;
}) {
  const working = job?.status === "queued" || job?.status === "running";
  return <aside className="np-ai-monitor np-ai-card" aria-live="polite">
    <div className="np-ai-monitor-heading"><span className={`np-ai-pulse ${working ? "is-working" : ""}`} /><div><small>РАБОТЕН МОНИТОР</small><h2>{project ? statusText[project.status] || project.status : "Нов епизод"}</h2></div></div>
    {busy && <p className="np-ai-monitor-current" role="status"><span className="np-ai-spinner" aria-hidden="true" />Заявката се изпраща…</p>}
    {working && <p className="np-ai-monitor-current" role="status"><span className="np-ai-spinner" aria-hidden="true" />{job.status === "queued" ? `${jobLabel(job)} е в опашката. Изчакайте worker-а да я поеме.` : job.usage?.progress?.stage || `${jobLabel(job)} се изпълнява…`}</p>}
    {working && job.usage?.progress && job.usage.progress.total ? <p className="np-ai-monitor-count">Сюжет {Math.min(job.usage.progress.completed ?? 0, job.usage.progress.total)} от {job.usage.progress.total}</p> : null}
    {job?.status === "failed" && <p className="np-ai-monitor-error" role="alert">{humanError(job.error)}</p>}
    {job?.status === "succeeded" && job.usage?.durationWarning && <p className="np-ai-monitor-error" role="status">Черновата е запазена с реална продължителност {durationLabel(job.usage.durationSec ?? 0)} при избрани {durationLabel(job.usage.targetSeconds ?? 0)}. Прослушайте я и коригирайте сценария само ако е необходимо.</p>}
    {error && <p className="np-ai-monitor-error" role="alert">{error}</p>}
    {message && <p className="np-ai-monitor-success" role="status">{message}</p>}
    <div className="np-ai-next"><small>КАКВО СЛЕДВА</small><p>{nextStep}</p></div>
    {job?.status === "failed" && job.attempts < 5 && <button type="button" className="np-ai-secondary" onClick={() => onRetry(job.id)}>Повтори задачата</button>}
    {working && <button type="button" className="np-ai-secondary" onClick={() => onCancel(job.id)}>Отмени задачата</button>}
    {jobs.length > 0 && <div className="np-ai-job-history"><small>ПОСЛЕДНИ ЗАДАЧИ</small>{jobs.slice(0, 5).map((item) => <div key={item.id}><span>{jobLabel(item)}</span><strong>{(item.status === "queued" || item.status === "running") && <span className="np-ai-spinner" aria-hidden="true" />}{jobStatus[item.status] || item.status}</strong></div>)}</div>}
  </aside>;
}

export function AiPodcastStudio({ mode, categories, webUrl, role, openProjectId, onOpenProject }: {
  mode: Mode; categories: Category[]; webUrl: string; role: string; openProjectId?: string | null; onOpenProject?: (id: string | null) => void;
}) {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(openProjectId ?? null);
  const [project, setProject] = useState<Project | null>(null);
  const [panel, setPanel] = useState<Panel>("script");
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [musicAsset, setMusicAsset] = useState<{ id: string; storageKey: string; prompt: string } | null>(null);
  const [mixedMusicAssetId, setMixedMusicAssetId] = useState<string | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [settings, setSettings] = useState<AiPodcastSettings>(defaults);
  const [articles, setArticles] = useState<Article[]>([]);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [segments, setSegments] = useState<AiPodcastSegment[]>([]);
  const [directions, setDirections] = useState<Record<string, string>>({});
  const [assets, setAssets] = useState<Asset[]>([]);
  const [voices, setVoices] = useState<Voice>(null);
  const [musicJobs, setMusicJobs] = useState<Job[]>([]);
  const [preset, setPreset] = useState<"daily" | "evening" | "breaking">("daily");
  const [musicPrompt, setMusicPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const editorRevision = useRef<{ id: string; revision: number } | null>(null);
  const currentProjectId = useRef<string | null>(openProjectId ?? null);

  const loadProjects = useCallback(async () => { const data = await api<{ projects: ProjectItem[] }>("?view=projects"); setProjects(data.projects); }, []);
  const loadProject = useCallback(async (id: string, reset = false) => {
    const data = await api<{ project: Project; jobs: Job[]; episode: Episode | null; musicAsset: { id: string; storageKey: string; prompt: string } | null; mixedMusicAssetId: string | null; voices: Voice }>(`?view=project&id=${id}`);
    if (currentProjectId.current !== id) return;
    setProject(data.project); setJobs(data.jobs); setEpisode(data.episode); setMusicAsset(data.musicAsset); setMixedMusicAssetId(data.mixedMusicAssetId); setVoices(data.voices);
    if (reset || editorRevision.current?.id !== id || editorRevision.current.revision !== data.project.revision) {
      setTitle(data.project.title ?? ""); setSummary(data.project.summary ?? ""); setSegments(data.project.segments);
      if (reset) setMusicPrompt(suggestedMusicPrompt(data.project));
    }
    editorRevision.current = { id, revision: data.project.revision };
  }, []);
  const loadAssets = useCallback(async () => { const data = await api<{ assets: Asset[]; voices: Voice; jobs: Job[] }>("?view=assets"); setAssets(data.assets); setVoices(data.voices); setMusicJobs(data.jobs); }, []);

  useEffect(() => { void (mode === "music" ? loadAssets() : loadProjects()).catch((cause) => setError((cause as Error).message)); }, [mode, loadAssets, loadProjects]);
  useEffect(() => { if (mode !== "studio") return; const timer = setTimeout(() => { void api<{ articles: Article[] }>(`?view=articles&q=${encodeURIComponent(query)}`).then((data) => setArticles(data.articles)).catch((cause) => setError((cause as Error).message)); }, 250); return () => clearTimeout(timer); }, [mode, query]);
  useEffect(() => { if (mode === "studio" && selectedId) void loadProject(selectedId, true).catch((cause) => setError((cause as Error).message)); }, [mode, selectedId, loadProject]);
  useEffect(() => { if (mode !== "studio" || !selectedId) return; const timer = setInterval(() => { void loadProject(selectedId).then(loadProjects).catch((cause) => setError((cause as Error).message)); }, 3000); return () => clearInterval(timer); }, [mode, selectedId, loadProject, loadProjects]);
  useEffect(() => { if (mode !== "library" && mode !== "music") return; const timer = setInterval(() => { void (mode === "music" ? loadAssets() : loadProjects()).catch((cause) => setError((cause as Error).message)); }, 8000); return () => clearInterval(timer); }, [mode, loadAssets, loadProjects]);

  async function act(action: Record<string, unknown>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await api("", action);
      setNotice(message);
      if (action.action === "produce" || action.action === "remix" || action.action === "music" || action.action === "regenerateCover" || action.action === "regenerateSegment") setPanel("production");
      if (mode === "music") await loadAssets();
      else if (selectedId) { await loadProject(selectedId, action.action === "edit"); await loadProjects(); }
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function create() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ id: string }>("", { action: "create", settings });
      await loadProjects(); currentProjectId.current = result.id; setSelectedId(result.id); onOpenProject?.(result.id); setPanel("script"); setNotice("Заявката е приета. Сценарият се подготвя.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function uploadCover() {
    if (!project || !coverFile) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.set("projectId", project.id); form.set("cover", coverFile);
      const response = await fetch(withBase("/api/podcasts/ai/cover"), { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Качването не успя.");
      setCoverFile(null); setNotice("Обложката е качена."); await loadProject(project.id);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function uploadMusic() {
    if (!project || !musicFile) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.set("projectId", project.id); form.set("music", musicFile);
      const response = await fetch(withBase("/api/podcasts/ai/music"), { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Качването не успя.");
      setMusicFile(null); setNotice("Музиката е качена. Прослушайте я и натиснете „Смеси с музиката“."); await loadProject(project.id);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  function lineChange(segmentId: string, index: number, patch: Partial<AiPodcastSegment["lines"][number]>) {
    setSegments((old) => old.map((segment) => segment.id === segmentId ? { ...segment, lines: segment.lines.map((line, i) => i === index ? { ...line, ...patch } : line) } : segment));
  }

  if (mode === "library") {
    const prepared = projects.filter((item) => item.status !== "ready");
    const generated = projects.filter((item) => item.status === "ready");
    const list = (items: ProjectItem[]) => items.length ? items.map((item) => <button type="button" key={item.id} className="np-ai-library-item" onClick={() => onOpenProject?.(item.id)}><strong>{item.title || "Нов AI епизод"}</strong><span>{statusText[item.status] || item.status} →</span></button>) : <p>Няма епизоди в този етап.</p>;
    return <div className="np-ai-library"><section className="np-ai-card"><h2>Подготвени епизоди</h2><p>Проекти със сценарий за преглед или текуща задача.</p>{list(prepared)}</section><section className="np-ai-card"><h2>Генерирани епизоди</h2><p>Готови аудио чернови за прослушване и редакторско публикуване.</p>{list(generated)}</section>{error && <p role="alert" className="np-ai-monitor-error">{error}</p>}</div>;
  }

  if (mode === "music") return <div className="np-ai-stack">
    <section className="np-ai-card"><h2>Бранд гласове</h2><p>Администраторът одобрява постоянните гласове на Алекс и Мая.</p><div className="np-ai-grid"><label>Алекс<select value={voices?.alexVoice ?? ""} onChange={(event) => setVoices({ alexVoice: event.target.value, mayaVoice: voices?.mayaVoice ?? "" })}><option value="">Изберете глас</option>{AI_PODCAST_VOICES.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label><label>Мая<select value={voices?.mayaVoice ?? ""} onChange={(event) => setVoices({ alexVoice: voices?.alexVoice ?? "", mayaVoice: event.target.value })}><option value="">Изберете глас</option>{AI_PODCAST_VOICES.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label></div>{role !== "editor" && <button type="button" className="np-ai-primary" disabled={busy || !voices?.alexVoice || !voices?.mayaVoice || voices.alexVoice === voices.mayaVoice} onClick={() => void act({ action: "setVoices", alex: voices!.alexVoice, maya: voices!.mayaVoice }, "Гласовете са одобрени.")}>Одобри гласовете</button>}</section>
    <section className="np-ai-card"><h2>Музикална библиотека</h2><p>Генерирайте, прослушайте и одобрете една заставка за всеки тип.</p><div className="np-ai-grid"><label>Заставка<select value={preset} onChange={(event) => setPreset(event.target.value as typeof preset)}><option value="daily">Daily</option><option value="evening">Evening</option><option value="breaking">Breaking</option></select></label><label>Описание<input value={musicPrompt} onChange={(event) => setMusicPrompt(event.target.value)} placeholder="Енергична новинарска заставка без вокали…" /></label></div>{role !== "editor" && <button type="button" className="np-ai-primary" disabled={busy || musicPrompt.trim().length < 10} onClick={() => void act({ action: "music", preset, projectId: null, prompt: musicPrompt }, "Генерирането на музика е заявено.")}>Генерирай музика</button>}
      {musicJobs.filter((job) => ["queued", "running", "failed"].includes(job.status)).map((job) => <p key={job.id}>{jobStatus[job.status]}: {job.usage?.progress?.stage || job.error || "Музика"} {job.status === "failed" && <button type="button" className="np-ai-link" onClick={() => void act({ action: "retry", jobId: job.id }, "Повторният опит е заявен.")}>Повтори</button>}</p>)}
    </section>
    <div className="np-ai-asset-grid">{assets.filter((asset) => asset.kind === "music").map((asset) => <article key={asset.id} className="np-ai-card"><strong>{asset.preset || "За епизод"} · {asset.status === "approved" ? "Одобрена" : "Кандидат"}</strong><p>{asset.prompt}</p><audio controls preload="none" src={media(asset.storageKey)} />{role !== "editor" && asset.preset && asset.status !== "approved" && <button type="button" className="np-ai-link" onClick={() => void act({ action: "approveMusic", assetId: asset.id }, "Заставката е одобрена.")}>Одобри</button>}</article>)}</div>
    {(error || notice) && <p role={error ? "alert" : "status"} className="np-ai-feedback">{error || notice}</p>}
  </div>;

  const active = jobs.some((job) => job.status === "queued" || job.status === "running");
  const latest = jobs[0];
  const unsaved = Boolean(project && (title !== (project.title ?? "") || summary !== (project.summary ?? "") || JSON.stringify(editorialText(segments)) !== JSON.stringify(editorialText(project.segments))));
  const words = scriptWords(segments);
  const plannedWords = project ? targetWords(project.settings) : 0;
  const wordReady = project ? words >= plannedWords * .9 && words <= plannedWords * 1.1 : false;
  const musicReady = !project || project.settings.music === "none" || Boolean(musicAsset);
  const musicAwaitingMix = Boolean(project?.status === "ready" && episode && project.settings.music === "custom" && musicAsset && mixedMusicAssetId !== musicAsset.id);
  const durationOutsideTarget = Boolean(project && episode && (episode.durationSec < project.settings.minutes * 60 * .9 || episode.durationSec > project.settings.minutes * 60 * 1.1));
  const canEdit = Boolean(project && ["review", "ready"].includes(project.status) && !active && !busy);
  const canProduce = Boolean(canEdit && !unsaved && wordReady && musicReady && voices && segments.length);
  let nextStep = "Изберете 3–5 публикувани статии и създайте сценарий.";
  if (project) {
    if (active) nextStep = "Изчакайте задачата. Мониторът се обновява автоматично; можете да разглеждате други раздели.";
    else if (latest?.status === "failed" && project.status === "failed") nextStep = latest.attempts < 5 ? "Прегледайте грешката и използвайте „Повтори задачата“." : "Достигнат е лимитът за повторения. Администраторът трябва да прегледа задачата.";
    else if (["review", "ready"].includes(project.status) && unsaved) nextStep = "Има незапазени редакции. Натиснете „Запази и провери“, после изчакайте проверката.";
    else if (musicAwaitingMix) nextStep = "Музиката е подготвена. Прослушайте я в „Медии и чернова“, после натиснете „Смеси с музиката“. Разговорът няма да се озвучава повторно.";
    else if (project.status === "ready") nextStep = durationOutsideTarget ? `Аудио черновата е готова: ${durationLabel(episode!.durationSec)} при избрани ${project.settings.minutes}:00. Прослушайте я и решете дали е нужна редакция.` : "Прослушайте аудио черновата. Публикуването е ръчно от раздел „Епизоди“.";
    else if (project.status === "review" && !wordReady) nextStep = `Сценарият е ${words} думи. За ${project.settings.minutes} минути са нужни ${Math.ceil(plannedWords * .9)}–${Math.floor(plannedWords * 1.1)} думи.`;
    else if (project.status === "review" && !voices) nextStep = "Липсват одобрени гласове. Администраторът ги избира в „Музикална библиотека“ → „Бранд гласове“.";
    else if (project.status === "review" && !musicReady) nextStep = "Избраната музика още не е готова. Генерирайте своя музика или одобрете заставка в библиотеката.";
    else if (project.status === "review") nextStep = "Сценарият е готов за редакторско одобрение. Натиснете „Одобри и озвучи“.";
    else if (project.status === "scripting") nextStep = "Изчакайте генерирането и фактологичната проверка на сценария.";
  }

  const selectProject = (id: string) => { currentProjectId.current = id; setSelectedId(id); onOpenProject?.(id); setProject(null); setJobs([]); setEpisode(null); setMusicAsset(null); setMixedMusicAssetId(null); setMusicFile(null); setPanel("script"); setError(""); setNotice(""); };
  return <div className="np-ai-workspace">
    <aside className="np-ai-projects np-ai-card"><div className="np-ai-row"><h2>Проекти</h2><button type="button" className="np-ai-link" onClick={() => { currentProjectId.current = null; setSelectedId(null); onOpenProject?.(null); setProject(null); setJobs([]); setEpisode(null); setMusicAsset(null); setSettings(defaults); setError(""); setNotice(""); }}>+ Нов</button></div><div className="np-ai-project-list">{projects.map((item) => <button type="button" key={item.id} className={`np-ai-project ${selectedId === item.id ? "is-active" : ""}`} onClick={() => selectProject(item.id)}><strong>{item.title || "Нов AI епизод"}</strong><small>{statusText[item.status] || item.status}</small></button>)}</div>{!projects.length && <p>Няма AI проекти.</p>}</aside>

    <main className="np-ai-main">
      {!selectedId ? <section className="np-ai-card"><small className="np-ai-eyebrow">НОВ ЕПИЗОД</small><h2>Източници и настройки</h2><p>Изберете 3–5 публикувани статии. След генерирането ще прегледате сценария, преди да се създаде аудио.</p><label>Търсене на статии<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Заглавие или тема" /></label><div className="np-ai-articles">{articles.map((article) => <label key={article.id}><input type="checkbox" checked={settings.articleIds.includes(article.id)} disabled={!settings.articleIds.includes(article.id) && settings.articleIds.length >= 5} onChange={() => setSettings((old) => ({ ...old, articleIds: old.articleIds.includes(article.id) ? old.articleIds.filter((id) => id !== article.id) : [...old.articleIds, article.id] }))} />{article.title}</label>)}</div><p>Избрани: {settings.articleIds.length} от 3–5.</p>
        <div className="np-ai-grid"><label>Продължителност<select value={settings.minutes} onChange={(event) => setSettings({ ...settings, minutes: Number(event.target.value) as AiPodcastSettings["minutes"] })}>{[5, 10, 15, 25].map((n) => <option key={n} value={n}>{n} минути</option>)}</select></label><label>Стил<select value={settings.style} onChange={(event) => setSettings({ ...settings, style: event.target.value as AiPodcastSettings["style"] })}><option value="natural">Естествен разговор</option><option value="serious">Сериозен</option><option value="analytical">Аналитичен</option><option value="dynamic">Динамичен</option></select></label><label>Увод<select value={settings.introMode} onChange={(event) => setSettings({ ...settings, introMode: event.target.value as AiPodcastSettings["introMode"] })}><option value="automatic">Автоматичен</option><option value="exact">Мой точен текст</option></select></label><label>Музика<select value={settings.music} onChange={(event) => setSettings({ ...settings, music: event.target.value as AiPodcastSettings["music"] })}><option value="none">Без музика</option><option value="daily">Daily</option><option value="evening">Evening</option><option value="breaking">Breaking</option><option value="custom">Нова за епизода</option></select></label><label>Рубрика<select value={settings.categoryId ?? ""} onChange={(event) => setSettings({ ...settings, categoryId: event.target.value || null })}><option value="">Без рубрика</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
        {settings.introMode === "exact" && <label>Точен увод<textarea value={settings.intro} onChange={(event) => setSettings({ ...settings, intro: event.target.value })} rows={3} /></label>}<label>Допълнителна насока<textarea value={settings.direction} onChange={(event) => setSettings({ ...settings, direction: event.target.value })} rows={2} /></label><button type="button" className="np-ai-primary" disabled={busy || settings.articleIds.length < 3 || (settings.introMode === "exact" && settings.intro.trim().length < 2)} onClick={() => void create()}>Създай сценарий</button></section> : project ? <>
        <header className="np-ai-project-head np-ai-card"><small className="np-ai-eyebrow">{statusText[project.status] || project.status}</small><h2>{project.title || "Нов AI епизод"}</h2><div className="np-ai-sources">{project.sources.map((source) => <a key={source.id} href={`${webUrl}${source.path}`} target="_blank" rel="noopener noreferrer">{source.title}</a>)}</div><div className="np-ai-panel-tabs" role="tablist" aria-label="Работа по епизода"><button type="button" role="tab" aria-selected={panel === "script"} className={panel === "script" ? "is-active" : ""} onClick={() => setPanel("script")}>Сценарий</button><button type="button" role="tab" aria-selected={panel === "production"} className={panel === "production" ? "is-active" : ""} onClick={() => setPanel("production")}>Медии и чернова</button></div></header>
        {panel === "script" ? <section className="np-ai-card np-ai-script-panel"><div className="np-ai-script-heading"><div><small className="np-ai-eyebrow">РЕДАКТОР</small><h2>Сценарий</h2></div><p>{words} думи · цел {plannedWords} · {project.settings.minutes} минути</p></div>
          {project.warnings.length > 0 && <details className="np-ai-warning-box"><summary>Фактологични предупреждения · {project.warnings.length}</summary>{project.warnings.map((warning, index) => <p key={index}><strong>„{warning.claim}“</strong> — {warning.reason}{warning.excerpt && <small> Пасаж: „{warning.excerpt}“</small>}{project.sources.find((source) => source.id === warning.sourceId) && <a href={`${webUrl}${project.sources.find((source) => source.id === warning.sourceId)!.path}`} target="_blank" rel="noopener noreferrer">Виж статията ↗</a>}</p>)}</details>}
          {segments.length ? <><div className="np-ai-grid"><label>Заглавие<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Резюме<textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={2} /></label></div><div className="np-ai-script-scroll">{segments.map((segment, segmentIndex) => <details key={segment.id} className="np-ai-segment"><summary><span>{segmentIndex + 1}. {segment.label}</span><small>{segment.lines.length} реплики</small></summary><div className="np-ai-segment-body"><div className="np-ai-row"><label>Заглавие на сюжета<input value={segment.label} onChange={(event) => setSegments((old) => old.map((item) => item.id === segment.id ? { ...item, label: event.target.value } : item))} /></label><button type="button" className="np-ai-link" disabled={segmentIndex === 0} onClick={() => setSegments((old) => move(old, segmentIndex, -1))}>Премести нагоре</button><button type="button" className="np-ai-link" disabled={segmentIndex === segments.length - 1} onClick={() => setSegments((old) => move(old, segmentIndex, 1))}>Премести надолу</button><button type="button" className="np-ai-link" disabled={segments.length === 1} onClick={() => setSegments((old) => old.filter((item) => item.id !== segment.id))}>Премахни</button></div>{segment.lines.map((line, index) => <div key={index} className="np-ai-line"><select aria-label={`Говорител на реплика ${index + 1}`} value={line.speaker} onChange={(event) => lineChange(segment.id, index, { speaker: event.target.value as "alex" | "maya" })}><option value="alex">Алекс</option><option value="maya">Мая</option></select><div><textarea aria-label={`Реплика ${index + 1}`} value={line.text} rows={2} onChange={(event) => lineChange(segment.id, index, { text: event.target.value })} /><input aria-label={`Насока за реплика ${index + 1}`} value={line.direction} onChange={(event) => lineChange(segment.id, index, { direction: event.target.value })} placeholder="Насока за изговор" /></div></div>)}<div className="np-ai-row"><button type="button" className="np-ai-link" onClick={() => setSegments((old) => old.map((item) => item.id === segment.id ? { ...item, lines: [...item.lines, { speaker: "maya", text: "", direction: "" }] } : item))}>+ Реплика</button>{segment.sourceId && <><input aria-label="Насока за пренаписване" value={directions[segment.id] || ""} onChange={(event) => setDirections({ ...directions, [segment.id]: event.target.value })} placeholder="Насока за промяна на сюжета" /><button type="button" className="np-ai-link" disabled={busy || active || (directions[segment.id] || "").trim().length < 2} onClick={() => void act({ action: "rewrite", projectId: project.id, segmentId: segment.id, direction: directions[segment.id] }, "Пренаписването е заявено.")}>AI пренапиши</button></>}{project.status === "ready" && <button type="button" className="np-ai-link" disabled={busy || active} onClick={() => void act({ action: "regenerateSegment", projectId: project.id, segmentId: segment.id }, "Повторното озвучаване е заявено.")}>Регенерирай звук</button>}</div></div></details>)}</div><div className="np-ai-script-actions"><div><button type="button" className="np-ai-primary" disabled={!canEdit || !unsaved || segments.some((segment) => segment.lines.some((line) => !line.text.trim()))} onClick={() => void act({ action: "edit", projectId: project.id, revision: project.revision, title, summary, segments }, "Редакцията е записана. Проверяват се променените сюжети.")}>Запази и провери</button><button type="button" className="np-ai-primary" disabled={!canProduce} onClick={() => void act({ action: "produce", projectId: project.id }, "Озвучаването е заявено. Следете работния монитор.")}>Одобри и озвучи</button></div><p>{nextStep}</p></div></> : <p>Сценарият още не е готов. Следете работния монитор.</p>}
        </section> : <div className="np-ai-stack"><section className="np-ai-card"><small className="np-ai-eyebrow">ВИЗИЯ</small><h2>Обложка</h2><div className="np-ai-cover-row">{project.coverKey && <img src={media(project.coverKey)} alt="Обложка на епизода" width={160} height={160} />}<div><button type="button" className="np-ai-secondary" disabled={!canEdit} onClick={() => void act({ action: "regenerateCover", projectId: project.id }, "Новата обложка се генерира.")}>Нова AI обложка</button><label>Своя обложка<input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} /></label><button type="button" className="np-ai-secondary" disabled={!coverFile || !canEdit} onClick={() => void uploadCover()}>Качи обложка</button></div></div></section>
          <section className="np-ai-card"><small className="np-ai-eyebrow">АУДИО</small><h2>Фонова музика</h2><p>Изберете подходящ инструментален фон. След прослушване го смесете с готовия разговор; гласовете няма да се генерират повторно.</p>
            <label>Описание за AI музика<input value={musicPrompt} onChange={(event) => setMusicPrompt(event.target.value)} placeholder="Спокоен, съвременен новинарски инструментал без вокали" /></label>
            <button type="button" className="np-ai-secondary" disabled={!canEdit || musicPrompt.trim().length < 10} onClick={() => void act({ action: "music", preset: null, projectId: project.id, prompt: musicPrompt }, "Генерирането на музика е заявено. Следете работния монитор.")}>Генерирай музика</button>
            <label>Или качете своя музика (MP3, до 30 MB)<input type="file" accept=".mp3,audio/mpeg" onChange={(event) => setMusicFile(event.target.files?.[0] ?? null)} /></label>
            <button type="button" className="np-ai-secondary" disabled={!canEdit || !musicFile} onClick={() => void uploadMusic()}>Качи музика</button>
            {musicAsset && <div><p>Избрана музика: {musicAsset.prompt}</p><audio controls preload="metadata" src={media(musicAsset.storageKey)} /></div>}
            {episode && musicAsset && <div><p>{musicAwaitingMix ? "Музиката още не е в аудио черновата." : "Музиката е в последното успешно смесване."}{unsaved && " Първо запазете редакциите в сценария."}</p><button type="button" className="np-ai-primary" disabled={!canEdit || unsaved || project.settings.music !== "custom" || !musicAwaitingMix} onClick={() => void act({ action: "remix", projectId: project.id }, "Смесването е заявено. Следете работния монитор.")}>Смеси с музиката</button></div>}
          </section>
          {episode ? <section className="np-ai-card"><small className="np-ai-eyebrow">ГОТОВА ЧЕРНОВА</small><h2>Прослушване</h2><p>{durationLabel(episode.durationSec)} мин · {episode.status}</p>{durationOutsideTarget && <p className="np-ai-monitor-error">Реалната продължителност се различава от избраните {project.settings.minutes} минути. Черновата е запазена за прослушване; редактирайте само ако е нужна по-точна дължина.</p>}<audio controls preload="metadata" src={media(episode.audioKey)} /><p>Гласове: Алекс — {jobs.find((job) => job.usage?.voices)?.usage?.voices?.alex || "неизвестен"}; Мая — {jobs.find((job) => job.usage?.voices)?.usage?.voices?.maya || "неизвестен"}. Фон: {mixedMusicAssetId ? "с музика" : "без музика"}.</p><details><summary>Транскрипт</summary><pre className="np-ai-transcript">{transcript(project.segments)}</pre></details><p>Публикуването е ръчно от раздел „Епизоди“ след редакторско прослушване.</p></section> : <section className="np-ai-card"><h2>Аудио чернова</h2><p>Още няма готов MP3. След одобрение на сценария изпълнението ще се вижда в работния монитор.</p></section>}</div>}
      </> : <section className="np-ai-card">Зареждане на проекта…</section>}
    </main>
    <Monitor project={project} job={latest} jobs={jobs} message={notice} error={error} nextStep={nextStep} busy={busy} onRetry={(id) => void act({ action: "retry", jobId: id }, "Задачата е върната в опашката.")} onCancel={(id) => void act({ action: "cancel", jobId: id }, "Задачата е отменена.")} />
  </div>;
}
