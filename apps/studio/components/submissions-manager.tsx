"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { withBase } from "@/lib/paths";
import {
  countByStatus,
  filterSubmissions,
  formatDate,
  KIND_LABELS,
  LABELS,
  snippet,
  STATUSES,
  statusTone,
  type Submission,
  type SubmissionStatus,
} from "./submissions-manager-utils";
import "./submissions-manager.css";

export type { Submission, SubmissionStatus };

export function SubmissionsManager({ initial }: { initial: Submission[] }) {
  const [items, setItems] = useState(initial);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const counts = useMemo(() => countByStatus(items), [items]);

  const filtered = useMemo(
    () => filterSubmissions(items, filterStatus, filterKind, query),
    [items, filterStatus, filterKind, query],
  );

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? filtered[0] ?? null,
    [items, selectedId, filtered],
  );

  // Keep the selection visible when filters change.
  useEffect(() => {
    if (!selected || !filtered.some((item) => item.id === selected.id)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selected]);

  async function change(item: Submission, next: string) {
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch(withBase("/api/editor/submissions/"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, status: next }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        setNotice({ tone: "error", text: data.error?.message ?? "Промяната не мина." });
        return;
      }
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: next as SubmissionStatus } : entry)));
      setNotice({ tone: "success", text: `Статусът е „${LABELS[next] ?? next}".` });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="np-submissions">
      <aside className="np-submissions-sidebar">
        <div className="np-submissions-side-head">
          <div className="np-submissions-counter">
            <span className="np-submissions-counter-num">{counts.all}</span>
            <span className="np-submissions-counter-label">{counts.all === 1 ? "сигнал" : "сигнала"}</span>
          </div>
        </div>

        <div className="np-submissions-search">
          <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth={2} />
            <path d="m20 20-4.2-4.2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Търсене…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="np-submissions-search-input"
            aria-label="Търсене в сигналите"
          />
        </div>

        <div className="np-submissions-chips" role="tablist" aria-label="Филтър">
          {([
            ["all", "Всички", counts.all],
            ["received", "Нови", counts.received],
            ["in_review", "В проверка", counts.in_review],
            ["verified", "Потвърдени", counts.verified],
          ] as const).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filterStatus === value}
              onClick={() => setFilterStatus(value)}
              className="np-submissions-chip"
            >
              {label}
              <span className="np-submissions-chip-count">{count}</span>
            </button>
          ))}
        </div>

        <div className="np-submissions-chips" role="tablist" aria-label="Тип">
          {([
            ["all", "Всички типове"],
            ["report", `Сигнали · ${counts.reports}`],
            ["my_news", `Моята новина · ${counts.my_news}`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filterKind === value}
              onClick={() => setFilterKind(value)}
              className="np-submissions-chip"
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length > 0 ? (
          <ul className="np-submissions-list" role="listbox" aria-label="Сигнали">
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.id === selected?.id}
                  onClick={() => setSelectedId(item.id)}
                  className="np-submissions-list-item"
                >
                  <span className="np-submissions-list-row">
                    <span className={`np-submissions-status np-submissions-status--${statusTone(item.status)}`}>
                      <span className="np-submissions-status-dot" />
                      {LABELS[item.status] ?? item.status}
                    </span>
                    <span className="np-submissions-list-kind">{KIND_LABELS[item.kind]}</span>
                  </span>
                  <span className="np-submissions-list-snippet">{snippet(item.payload)}</span>
                  <span className="np-submissions-list-meta">{formatDate(item.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="np-submissions-empty">
            {query
              ? <p>Нищо не съвпада с „{query.trim()}".</p>
              : filterStatus !== "all"
                ? <p>Няма сигнали в статус „{LABELS[filterStatus] ?? filterStatus}".</p>
                : <p>Няма сигнали по тези филтри.</p>}
          </div>
        )}
      </aside>

      <div className="np-submissions-main">
        {selected ? (
          <article className="np-submissions-detail">
            <header className="np-submissions-detail-head">
              <div className="np-submissions-detail-head-left">
                <span className={`np-submissions-status np-submissions-status--${statusTone(selected.status)}`}>
                  <span className="np-submissions-status-dot" />
                  {LABELS[selected.status] ?? selected.status}
                </span>
                <h2>{KIND_LABELS[selected.kind]}</h2>
                <p className="np-submissions-detail-date">{formatDate(selected.createdAt)}</p>
              </div>
              <button
                type="button"
                className="np-submissions-close"
                onClick={() => setSelectedId(null)}
                aria-label="Затвори"
                title="Затвори"
              >
                ×
              </button>
            </header>

            <div className="np-submissions-detail-body">
              {selected.kind === "my_news" ? (
                <div className="np-submissions-grid">
                  <Field label="Работно заглавие">{String(selected.payload.workingTitle ?? "—")}</Field>
                  <Field label="Име за публикуване">{String(selected.payload.publishName ?? "—")}</Field>
                  <Field label="Къде и кога" wide>
                    <p className="np-submissions-pre">{String(selected.payload.whereWhen ?? "—")}</p>
                  </Field>
                </div>
              ) : null}

              <Field label={selected.kind === "my_news" ? "Описание" : "Какво се случи"}>
                <p className="np-submissions-pre">{String(selected.payload.description ?? selected.payload.whatHappened ?? "—")}</p>
              </Field>

              {selected.payload.position && typeof selected.payload.position === "object" ? (
                <Field label="Локация">
                  <p className="np-submissions-pre">{JSON.stringify(selected.payload.position)}</p>
                </Field>
              ) : null}

              {Array.isArray(selected.payload.files) && selected.payload.files.length ? (
                <Field label={`Прикачени снимки (${(selected.payload.files as unknown[]).length})`}>
                  <div className="np-submissions-photos">
                    {(selected.payload.files as { path: string }[]).map((photo) => (
                      <a
                        key={photo.path}
                        href={withBase(`/api/editor/submissions/photo/?path=${encodeURIComponent(photo.path)}`)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img src={withBase(`/api/editor/submissions/photo/?path=${encodeURIComponent(photo.path)}`)} alt="Снимка към сигнала" loading="lazy" />
                      </a>
                    ))}
                  </div>
                </Field>
              ) : null}

              <Field label="Контакт">{selected.contact || <span className="text-muted">Не е посочен</span>}</Field>

              {selected.articleId ? (
                <a
                  href={withBase(`/articles/${selected.articleId}`)}
                  className="np-submissions-link"
                >
                  Отвори свързаната статия
                  <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden="true">
                    <path d="M5 12h14M13 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ) : null}
            </div>

            <footer className="np-submissions-detail-foot">
              {notice ? (
                <p
                  role={notice.tone === "error" ? "alert" : "status"}
                  className={`np-submissions-alert np-submissions-alert--${notice.tone}`}
                >
                  {notice.text}
                </p>
              ) : <span />}
              <div className="np-submissions-status-actions">
                {STATUSES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={pending || selected.status === value}
                    onClick={() => void change(selected, value)}
                    className={`np-submissions-status-btn ${selected.status === value ? "is-active" : ""}`}
                  >
                    {LABELS[value]}
                  </button>
                ))}
              </div>
            </footer>
          </article>
        ) : (
          <div className="np-submissions-detail-empty">
            <h2>Изберете сигнал отляво</h2>
            <p>Или изчакайте първите подадени сигнали от читателите.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`np-submissions-field ${wide ? "np-submissions-field--wide" : ""}`}>
      <span className="np-submissions-field-label">{label}</span>
      <div className="np-submissions-field-value">{children}</div>
    </div>
  );
}