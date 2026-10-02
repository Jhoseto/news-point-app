"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { withBase } from "@/lib/paths";
import {
  countByStatus,
  filterMyNews,
  formatDate,
  formatDateLong,
  isEditorialUpdateValid,
  MY_NEWS_STATUSES,
  nextAllowedStatuses,
  normalizeSubmission,
  parsePayload,
  photoUrl,
  snippet,
  sortByDate,
  STATUS_LABELS,
  statusTone,
  type MyNewsStatus,
  type MyNewsSubmission,
} from "./my-news-utils";
import "./my-news-manager.css";

type ApiRow = {
  id: string;
  status: string;
  payload: Record<string, unknown>;
  contact: string | null;
  createdAt: string;
  articleId: string | null;
};

export function MyNewsManager({ initial, newArticleHref }: { initial: ApiRow[]; newArticleHref: string }) {
  const [items, setItems] = useState<MyNewsSubmission[]>(() => sortByDate(initial.map(normalizeSubmission)));
  const [filter, setFilter] = useState<"all" | MyNewsStatus>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const currentRequest = useRef(0);

  const counts = useMemo(() => countByStatus(items), [items]);
  const filtered = useMemo(() => filterMyNews(items, filter, query), [items, filter, query]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? filtered[0] ?? null,
    [items, selectedId, filtered],
  );

  useEffect(() => {
    if (!selected || !filtered.some((item) => item.id === selected.id)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selected]);

  async function patchStatus(item: MyNewsSubmission, status: MyNewsStatus) {
    if (!isEditorialUpdateValid({ status })) return;
    const previousStatus = item.status;
    setPending(true);
    setNotice(null);
    // optimistic update; rollback on failure
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status } : entry)));
    try {
      const response = await fetch(withBase("/api/editor/submissions/"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, status }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: previousStatus } : entry)));
        setNotice({ tone: "error", text: data.error?.message ?? "Промяната не мина." });
        return;
      }
      setNotice({ tone: "success", text: `Статусът е „${STATUS_LABELS[status] ?? status}".` });
    } catch {
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: previousStatus } : entry)));
      setNotice({ tone: "error", text: "Няма връзка със сървъра." });
    } finally {
      setPending(false);
    }
  }

  async function linkToArticle(item: MyNewsSubmission, articleId: string) {
    const trimmed = articleId.trim();
    if (!isEditorialUpdateValid({ status: item.status, articleId: trimmed || null })) return;
    const previousArticleId = item.articleId;
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, articleId: trimmed || null } : entry)));
    setPending(true);
    try {
      const response = await fetch(withBase("/api/editor/submissions/"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, status: item.status, articleId: trimmed || null }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, articleId: previousArticleId } : entry)));
        setNotice({ tone: "error", text: data.error?.message ?? "Свързването не мина." });
        return;
      }
      setNotice({ tone: "success", text: trimmed ? "Свързано е със статия." : "Връзката е премахната." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="np-mynews">
      <aside className="np-mynews-sidebar">
        <div className="np-mynews-side-head">
          <div className="np-mynews-counter">
            <span className="np-mynews-counter-num">{counts.all}</span>
            <span className="np-mynews-counter-label">{counts.all === 1 ? "материал" : "материала"}</span>
          </div>
        </div>

        <div className="np-mynews-search">
          <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth={2} />
            <path d="m20 20-4.2-4.2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Търсене в материалите…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="np-mynews-search-input"
            aria-label="Търсене в материалите"
          />
        </div>

        <div className="np-mynews-chips" role="tablist" aria-label="Филтър">
          {([
            ["all", "Всички", counts.all],
            ["received", "Нови", counts.received ?? 0],
            ["in_review", "В проверка", counts.in_review ?? 0],
            ["verified", "Потвърдени", counts.verified ?? 0],
            ["published", "Публикувани", counts.published ?? 0],
            ["rejected", "Отхвърлени", counts.rejected ?? 0],
          ] as const).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className="np-mynews-chip"
            >
              {label}
              <span className="np-mynews-chip-count">{count}</span>
            </button>
          ))}
        </div>

        {filtered.length > 0 ? (
          <ul className="np-mynews-list" role="listbox" aria-label="Материали от читатели">
            {filtered.map((item) => {
              const parsed = parsePayload(item.payload);
              const photoCount = item.photos.length;
              const hasPosition = Boolean(item.position);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={item.id === selected?.id}
                    onClick={() => setSelectedId(item.id)}
                    className="np-mynews-list-item"
                  >
                    <span className="np-mynews-list-row">
                      <span className={`np-mynews-status np-mynews-status--${statusTone(item.status)}`}>
                        <span className="np-mynews-status-dot" />
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                      {item.articleId ? (
                        <span className="np-mynews-list-tag np-mynews-list-tag--positive" aria-label="Свързано със статия">Статия</span>
                      ) : null}
                    </span>
                    <span className="np-mynews-list-title">
                      {parsed.workingTitle || snippet(item.payload) || "Без заглавие"}
                    </span>
                    <span className="np-mynews-list-meta">
                      <span>{formatDate(item.createdAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{parsed.publishName || "Без автор"}</span>
                      {photoCount > 0 ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="np-mynews-list-badges">
                            <PhotoBadge count={photoCount} />
                          </span>
                        </>
                      ) : null}
                      {hasPosition ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span aria-label="Има локация">📍</span>
                        </>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="np-mynews-empty">
            {query ? <p>Нищо не съвпада с „{query.trim()}".</p> : <p>Няма подадени материали.</p>}
          </div>
        )}
      </aside>

      <div className="np-mynews-main">
        {selected ? (
          <SubmissionDetail
            key={selected.id}
            submission={selected}
            pending={pending}
            onStatusChange={status => void patchStatus(selected, status)}
            onLinkArticle={articleId => void linkToArticle(selected, articleId)}
            newArticleHref={newArticleHref}
            notice={notice}
          />
        ) : (
          <div className="np-mynews-detail-empty">
            <h2>Все още няма материали</h2>
            <p>Първият сигнал ще се покаже тук, веднага след като читател подаде предложение.</p>
            <a className="np-mynews-btn np-mynews-btn--secondary" href="/admin/livepoint">Отворете LivePoint страницата</a>
          </div>
        )}
      </div>
    </div>
  );
}

function PhotoBadge({ count }: { count: number }) {
  return (
    <span className="np-mynews-photo-badge" title={`${count} снимки`}>
      <svg viewBox="0 0 24 24" width={11} height={11} aria-hidden="true">
        <path d="M4 7h16v12H4zM9 7l1.5-2h3L15 7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {count}
    </span>
  );
}

function SubmissionDetail({
  submission,
  pending,
  onStatusChange,
  onLinkArticle,
  newArticleHref,
  notice,
}: {
  submission: MyNewsSubmission;
  pending: boolean;
  onStatusChange: (status: MyNewsStatus) => void;
  onLinkArticle: (articleId: string) => void;
  newArticleHref: string;
  notice: { tone: "error" | "success"; text: string } | null;
}) {
  const parsed = parsePayload(submission.payload);
  const allowed = nextAllowedStatuses(submission.status);
  const [linkInput, setLinkInput] = useState<string>(submission.articleId ?? "");

  useEffect(() => {
    setLinkInput(submission.articleId ?? "");
  }, [submission.id, submission.articleId]);

  const isPublished = submission.status === "published";

  return (
    <article className="np-mynews-detail">
      <header className="np-mynews-detail-head">
        <div className="np-mynews-detail-head-left">
          <span className={`np-mynews-status np-mynews-status--${statusTone(submission.status)}`}>
            <span className="np-mynews-status-dot" />
            {STATUS_LABELS[submission.status] ?? submission.status}
          </span>
          <h2>{parsed.workingTitle || "Без заглавие"}</h2>
          <div className="np-mynews-detail-meta">
            <span>Получен {formatDateLong(submission.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{(MY_NEWS_STATUSES as readonly string[]).includes(submission.status) ? STATUS_LABELS[submission.status] : submission.status}</span>
            {submission.contact ? (
              <>
                <span aria-hidden="true">·</span>
                <span>Контакт: {submission.contact}</span>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="np-mynews-detail-body">
        <div className="np-mynews-detail-fields">
          <Field label="Автор" value={parsed.publishName} placeholder="-" />
          <Field label="Име за публикуване" value={parsed.publishName} placeholder="-" />
          <Field label="Къде и кога" wide={true} value={parsed.whereWhen} placeholder="-" multiline={true} />
          <Field label="Какво се е случило" wide={true} value={parsed.whatHappened} placeholder="-" multiline={true} />
          <Field label="Контакт за редакцията" value={submission.contact ?? "-"} />
          <Field
            label="Локация"
            value={submission.position ? `${submission.position.lat.toFixed(5)}, ${submission.position.lon.toFixed(5)}` : null}
            placeholder="-"
          />
        </div>

        {submission.photos.length > 0 ? (
          <section className="np-mynews-photos">
            <header>
              <h3>Прикачени снимки</h3>
              <span>{submission.photos.length} {submission.photos.length === 1 ? "снимка" : "снимки"}</span>
            </header>
            <div className="np-mynews-photos-grid">
              {submission.photos.map((photo, index) => (
                <a
                  key={photo.path}
                  className="np-mynews-photo"
                  target="_blank"
                  rel="noreferrer"
                  href={withBase(photoUrl(photo.path))}
                >
                  <img src={withBase(photoUrl(photo.path))} alt={`Снимка ${index + 1} към материала`} loading="lazy" />
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section className="np-mynews-status-actions" aria-label="Промяна на статуса">
          <header>
            <h3>Статус</h3>
            <span>Само позволените преходи са активни.</span>
          </header>
          <div className="np-mynews-status-pills">
            {MY_NEWS_STATUSES.map((value) => {
              const isCurrent = submission.status === value;
              const isAllowed = allowed.includes(value) || isCurrent;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={pending || isCurrent || !isAllowed}
                  onClick={() => onStatusChange(value)}
                  aria-pressed={isCurrent}
                  className={`np-mynews-status-pill ${isCurrent ? "is-current" : ""} ${!isAllowed && !isCurrent ? "is-disabled" : ""}`}
                >
                  {STATUS_LABELS[value]}
                </button>
              );
            })}
          </div>
          <p className="np-mynews-status-help">
            <strong>Получен</strong> → прегледаме; <strong>В проверка</strong> → проверяваме фактите; <strong>Потвърден</strong> → готов за публикуване; <strong>Публикуван</strong> → материалът е на сайта; <strong>Отхвърлен</strong> → не отговаря на редакционните стандарти.
          </p>
        </section>

        <section className="np-mynews-link-article" aria-label="Свързване със статия">
          <header>
            <h3>Свързване със статия</h3>
            <span>Поставете ID на публикуваната статия, която използва този материал.</span>
          </header>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onLinkArticle(linkInput);
            }}
            className="np-mynews-link-form"
          >
            <input
              type="text"
              placeholder="UUID на статията"
              value={linkInput}
              onChange={(event) => setLinkInput(event.target.value)}
              className="np-mynews-input np-mynews-input--mono"
              aria-label="ID на свързаната статия"
            />
            <button type="submit" disabled={pending} className="np-mynews-btn np-mynews-btn--secondary">
              Запиши
            </button>
            {isPublished && !submission.articleId ? (
              <a className="np-mynews-btn np-mynews-btn--primary" href={newArticleHref}>
                Създай статия от този материал
              </a>
            ) : null}
            {submission.articleId ? (
              <a className="np-mynews-link" href={withBase(`/articles/${submission.articleId}`)} target="_blank" rel="noreferrer">
                Отвори статията
                <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden="true">
                  <path d="M5 12h14M13 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ) : null}
          </form>
        </section>

        <div className="np-mynews-consent">
          <span className={`np-mynews-consent-pill ${parsed.factsAck ? "is-ok" : ""}`}>
            {parsed.factsAck ? "✓" : "-"} Фактите са потвърдени
          </span>
          <span className={`np-mynews-consent-pill ${parsed.rightsAck ? "is-ok" : ""}`}>
            {parsed.rightsAck ? "✓" : "-"} Правата са уредени
          </span>
          <span className={`np-mynews-consent-pill ${submission.photos.length > 0 ? "is-ok" : ""}`}>
            {submission.photos.length > 0 ? "✓" : "-"} {submission.photos.length} прикачени
          </span>
          <span className={`np-mynews-consent-pill ${submission.contact ? "is-ok" : ""}`}>
            {submission.contact ? "✓" : "-"} Контакт {submission.contact ? "налице" : "липсва"}
          </span>
        </div>
      </div>

      <footer className="np-mynews-detail-foot">
        {notice ? (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={`np-mynews-alert np-mynews-alert--${notice.tone}`}
          >
            {notice.text}
          </p>
        ) : (
          <span />
        )}
      </footer>
    </article>
  );
}

function Field({ label, value, placeholder, wide = false, multiline = false }: { label: string; value: string | null; placeholder?: string; wide?: boolean; multiline?: boolean }) {
  return (
    <div className={`np-mynews-field ${wide ? "np-mynews-field--wide" : ""}`}>
      <span className="np-mynews-field-label">{label}</span>
      {multiline ? (
        <p className="np-mynews-field-pre">{value || <span className="text-muted">{placeholder ?? "-"}</span>}</p>
      ) : (
        <p className="np-mynews-field-value">{value || <span className="text-muted">{placeholder ?? "-"}</span>}</p>
      )}
    </div>
  );
}