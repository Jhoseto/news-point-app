"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pollInput, type PollInput, type Poll, type PublicPoll } from "@newspoint/db/poll-types";
import { withBase } from "@/lib/paths";
import { callApi } from "@/lib/client-api";
import "./poll-manager.css";

type List = { items: (Poll & { realTotal: number })[]; more: boolean };
type Details = {
  poll: Poll;
  counts: Record<string, number>;
  result: PublicPoll;
  votes: { id: string; optionId: string; createdAt: string }[];
  revisions: { id: string; actorName: string; reason: string; snapshot: Poll; createdAt: string }[];
  moreVotes: boolean;
  moreRevisions: boolean;
};

const STATUS_NAMES: Record<PollInput["status"], string> = {
  draft: "Чернова",
  open: "Отворена",
  closed: "Приключила",
  archived: "Архив",
};

const STATUS_TONE: Record<PollInput["status"], string> = {
  draft: "neutral",
  open: "positive",
  closed: "info",
  archived: "neutral",
};

const date = (value: string) =>
  new Intl.DateTimeFormat("bg-BG", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Sofia" }).format(new Date(value));

function optionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 3) | 8).toString(16);
  });
}

function blank(): PollInput {
  return {
    version: 0,
    question: "",
    description: "",
    options: [
      { id: optionId(), label: "" },
      { id: optionId(), label: "" },
    ],
    status: "draft",
    featured: false,
    startsAt: null,
    endsAt: null,
  };
}

function inputFrom(p: Poll): PollInput {
  const { id, version, question, description, options, status, featured, startsAt, endsAt } = p;
  return { id, version, question, description, options, status, featured, startsAt, endsAt };
}

function localTime(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function iso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export function PollManager({ initial, canCorrect }: { initial: List; canCorrect: boolean }) {
  const [list, setList] = useState(initial);
  const [listPage, setListPage] = useState(0);
  const [draft, setDraft] = useState<PollInput | null>(null);
  const [saved, setSaved] = useState("");
  const [details, setDetails] = useState<Details | null>(null);
  const [tab, setTab] = useState<"edit" | "results" | "history">("edit");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const currentRequest = useRef(0);

  const dirty = !!draft && JSON.stringify(draft) !== saved;
  const correctionsDirty = !!details && JSON.stringify(deltas) !== JSON.stringify(details.poll.adjustments);
  const unsaved = dirty || correctionsDirty;

  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (unsaved) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [unsaved]);

  async function read<T>(query: string): Promise<T> {
    const r = await fetch(withBase(`/api/polls/${query}`), { cache: "no-store" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || "Няма връзка.");
    return data;
  }

  function install(data: Details) {
    setDetails(data);
    const form = inputFrom(data.poll);
    setDraft(form);
    setSaved(JSON.stringify(form));
    setDeltas(data.poll.adjustments);
  }

  async function open(id: string, nextPage = 0) {
    if (unsaved && !window.confirm("Има незаписани промени. Да ги отхвърля ли?")) return;
    const request = ++currentRequest.current;
    setBusy(true);
    setNotice("");
    try {
      const data = await read<Details>(`?id=${id}&page=${nextPage}`);
      if (request === currentRequest.current) {
        install(data);
        setPage(nextPage);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Неуспешно зареждане.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshList(nextPage = listPage) {
    setList(await read<List>(`?page=${nextPage}`));
    setListPage(nextPage);
  }

  function create(copy = false) {
    if (unsaved && !window.confirm("Да отхвърля ли незаписаните промени?")) return;
    const next =
      copy && draft
        ? {
            ...draft,
            id: undefined,
            version: 0,
            question: draft.question,
            options: draft.options.map((o) => ({ ...o, id: optionId() })),
            status: "draft" as const,
            featured: false,
            startsAt: null,
            endsAt: null,
          }
        : blank();
    currentRequest.current++;
    setDraft(next);
    setSaved(JSON.stringify(next));
    setDetails(null);
    setDeltas({});
    setPage(0);
    setTab("edit");
    setNotice("");
  }

  function patch(value: Partial<PollInput>) {
    setDraft((p) => (p ? { ...p, ...value } : p));
  }

  async function save(correction = false) {
    if (!draft || busy) return;
    if (!correction) {
      const parsed = pollInput.safeParse(draft);
      if (!parsed.success) {
        setNotice(parsed.error.issues.map((i) => i.message).join(" "));
        return;
      }
    }
    setBusy(true);
    setNotice("");
    try {
      const result = await callApi<{ poll: Poll; refreshed: boolean }>(
        "POST",
        "/api/polls/",
        correction
          ? { action: "correct", input: { id: draft.id, version: draft.version, deltas } }
          : { action: "save", input: draft },
      );
      if (!result.ok) {
        setNotice(result.error.message);
        return;
      }
      const form = inputFrom(result.data.poll);
      setDraft(form);
      setSaved(JSON.stringify(form));
      setDeltas(result.data.poll.adjustments);
      install(await read<Details>(`?id=${result.data.poll.id}`));
      setPage(0);
      await refreshList();
      setNotice(
        result.data.refreshed
          ? "Промените са записани."
          : "Промените са записани. Началната страница ще ги получи при следващото обновяване до около минута.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Опитайте отново.");
    } finally {
      setBusy(false);
    }
  }

  const locked = details ? Object.values(details.counts).some((n) => n > 0) : false;
  const realTotal = details ? Object.values(details.counts).reduce((a, b) => a + b, 0) : 0;
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: list.items.length, featured: 0 };
    for (const status of Object.keys(STATUS_NAMES) as PollInput["status"][]) {
      map[status] = 0;
    }
    for (const item of list.items) {
      map[item.status] = (map[item.status] ?? 0) + 1;
      if (item.featured) map.featured = (map.featured ?? 0) + 1;
    }
    return map;
  }, [list]);

  return (
    <div className="np-polls">
      <aside className="np-polls-sidebar">
        <div className="np-polls-side-head">
          <div className="np-polls-counter">
            <span className="np-polls-counter-num">{counts.all}</span>
            <span className="np-polls-counter-label">{counts.all === 1 ? "анкета" : "анкети"}</span>
          </div>
          <button disabled={busy} onClick={() => create()} className="np-polls-new-btn" aria-label="Нова анкета">
            <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
              <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
            </svg>
            Нова анкета
          </button>
        </div>

        <div className="np-polls-chips" role="tablist" aria-label="Филтър">
          {([
            ["all", "Всички", counts.all],
            ["open", "Отворени", counts.open ?? 0],
            ["draft", "Чернови", counts.draft ?? 0],
            ["closed", "Приключили", counts.closed ?? 0],
            ["archived", "Архив", counts.archived ?? 0],
          ] as const).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={value === "all"}
              onClick={() => {}}
              className="np-polls-chip"
              title="Предстои"
            >
              {label}
              <span className="np-polls-chip-count">{count}</span>
            </button>
          ))}
        </div>

        {list.items.length > 0 ? (
          <ul className="np-polls-list" role="listbox" aria-label="Анкети">
            {list.items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  disabled={busy}
                  aria-selected={draft?.id === p.id}
                  onClick={() => void open(p.id)}
                  className="np-polls-list-item"
                >
                  <span className="np-polls-list-row">
                    <span className={`np-polls-status np-polls-status--${STATUS_TONE[p.status]}`}>
                      <span className="np-polls-status-dot" />
                      {STATUS_NAMES[p.status]}
                    </span>
                    {p.featured ? <span className="np-polls-list-featured">На началната</span> : null}
                  </span>
                  <span className="np-polls-list-question">{p.question || "Без въпрос"}</span>
                  <span className="np-polls-list-meta">
                    {p.realTotal} реални гласа · {date(p.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="np-polls-empty">
            <p>Няма създадени анкети. Започнете с въпрос и поне два отговора.</p>
          </div>
        )}

        <div className="np-polls-pagination">
          <button disabled={busy || listPage === 0} onClick={() => void refreshList(listPage - 1).catch((e) => setNotice(e.message))}>
            ←
          </button>
          <span>Страница {listPage + 1}</span>
          <button disabled={busy || !list.more} onClick={() => void refreshList(listPage + 1).catch((e) => setNotice(e.message))}>
            →
          </button>
        </div>
      </aside>

      <div className="np-polls-main">
        {!draft ? (
          <div className="np-polls-empty-state">
            <div className="np-polls-empty-illu" aria-hidden="true">
              <svg viewBox="0 0 24 24" width={48} height={48}>
                <path d="M5 20V10M12 20V4M19 20v-7" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
              </svg>
            </div>
            <h2>Дайте думата на читателите</h2>
            <p>Създайте кратка анкета или изберете съществуваща отляво, за да видите участието.</p>
            <button onClick={() => create()} className="np-polls-primary-btn">Създай анкета</button>
          </div>
        ) : (
          <>
            <header className="np-polls-toolbar">
              <div className="np-polls-tabs" role="tablist">
                {([
                  ["edit", "Редакция"],
                  ["results", "Резултати"],
                  ["history", "История"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    disabled={busy || (key !== "edit" && !details)}
                    aria-pressed={tab === key}
                    onClick={() => setTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="np-polls-tools">
                {draft.id ? (
                  <button type="button" disabled={busy} onClick={() => create(true)}>
                    Дублирай
                  </button>
                ) : null}
                {draft.id ? (
                  <button type="button" disabled={busy} onClick={() => void open(draft.id!)}>
                    Обнови
                  </button>
                ) : null}
              </div>
            </header>

            {tab === "edit" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
                className="np-polls-editor"
              >
                <fieldset disabled={busy} className="np-polls-fieldset">
                  <label className="np-polls-label">
                    <span>
                      Въпрос <small>{draft.question.length}/220</small>
                    </span>
                    <textarea
                      rows={2}
                      value={draft.question}
                      minLength={5}
                      maxLength={220}
                      required
                      disabled={locked}
                      onChange={(e) => patch({ question: e.target.value })}
                      placeholder="Какво искате да попитате читателите?"
                    />
                  </label>
                  <label className="np-polls-label">
                    <span>Кратко пояснение <small>по желание</small></span>
                    <input
                      value={draft.description}
                      maxLength={300}
                      disabled={locked}
                      onChange={(e) => patch({ description: e.target.value })}
                    />
                  </label>

                  <div className="np-polls-section">
                    <div className="np-polls-section-head">
                      <h3>Отговори</h3>
                      <span>2–6 възможности · един избор</span>
                    </div>
                    <div className="np-polls-options">
                      {draft.options.map((o, index) => (
                        <div key={o.id} className="np-polls-option">
                          <span className="np-polls-option-index">{String(index + 1).padStart(2, "0")}</span>
                          <input
                            aria-label={`Отговор ${index + 1}`}
                            required
                            maxLength={120}
                            disabled={locked}
                            value={o.label}
                            onChange={(e) => patch({ options: draft.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })}
                          />
                          <button
                            type="button"
                            title="Премахни отговора"
                            aria-label={`Премахни отговор ${index + 1}`}
                            disabled={locked || draft.options.length <= 2}
                            onClick={() => patch({ options: draft.options.filter((x) => x.id !== o.id) })}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="np-polls-text-button"
                      disabled={locked || draft.options.length >= 6}
                      onClick={() => patch({ options: [...draft.options, { id: optionId(), label: "" }] })}
                    >
                      ＋ Добави отговор
                    </button>
                  </div>

                  {locked ? (
                    <p className="np-polls-hint">
                      Вече има гласове. Въпросът и отговорите са заключени, за да се запази смисълът на резултатите. За промяна използвайте „Дублирай".
                    </p>
                  ) : null}

                  <div className="np-polls-settings">
                    <label className="np-polls-label">
                      <span>Състояние</span>
                      <select
                        value={draft.status}
                        onChange={(e) => {
                          const status = e.target.value as PollInput["status"];
                          patch({ status, featured: status === "draft" || status === "archived" ? false : draft.featured });
                        }}
                      >
                        {Object.entries(STATUS_NAMES).map(([key, name]) => (
                          <option key={key} value={key}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="np-polls-label">
                      <span>Начало</span>
                      <input
                        type="datetime-local"
                        value={localTime(draft.startsAt)}
                        onChange={(e) => patch({ startsAt: iso(e.target.value) })}
                      />
                    </label>
                    <label className="np-polls-label">
                      <span>Край</span>
                      <input
                        type="datetime-local"
                        value={localTime(draft.endsAt)}
                        onChange={(e) => patch({ endsAt: iso(e.target.value) })}
                      />
                    </label>
                  </div>

                  <p className="np-polls-hint">
                    Часовете са в часовата зона на устройството: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Празно начало = веднага; празен край = до ръчно приключване.
                  </p>

                  <label className="np-polls-toggle">
                    <input
                      type="checkbox"
                      disabled={draft.status === "draft" || draft.status === "archived"}
                      checked={draft.featured}
                      onChange={(e) => patch({ featured: e.target.checked })}
                    />
                    <span>
                      <strong>Показвай на началната страница</strong>
                      <small>Между „Регион" и „България". Заменя текущата избрана анкета.</small>
                    </span>
                  </label>

                  {draft.featured && draft.startsAt && Date.parse(draft.startsAt) > Date.now() ? (
                    <p className="np-polls-hint">
                      Текущата анкета ще бъде заменена при записа. Новата ще се покаже след началния час; дотогава секцията ще е скрита.
                    </p>
                  ) : null}

                  <div className="np-polls-footer">
                    <span className="np-polls-save-state">
                      {dirty ? "Незаписани промени" : draft.id ? "Всички промени са запазени" : "Нова чернова"}
                    </span>
                    <button type="submit" disabled={busy} className="np-polls-primary-btn">
                      {busy ? "Записване…" : "Запази анкетата"}
                    </button>
                  </div>
                </fieldset>
              </form>
            )}

            {tab === "results" && details && (
              <div className="np-polls-editor">
                <div className="np-polls-stats">
                  <div>
                    <strong>{realTotal}</strong>
                    <span>Реални гласове</span>
                  </div>
                  <div>
                    <strong>{details.result.total}</strong>
                    <span>Показан резултат</span>
                  </div>
                  <div>
                    <strong>{details.result.open ? "Отворена" : "Затворена"}</strong>
                    <span>В момента</span>
                  </div>
                </div>
                <div className="np-polls-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Отговор</th>
                        <th>Реални</th>
                        <th>Корекция ±</th>
                        <th>Показани</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.poll.options.map((o) => (
                        <tr key={o.id}>
                          <td>{o.label}</td>
                          <td>{details.counts[o.id] ?? 0}</td>
                          <td>
                            {canCorrect ? (
                              <input
                                aria-label={`Корекция за ${o.label}`}
                                disabled={busy}
                                type="number"
                                step={1}
                                min={-(details.counts[o.id] ?? 0)}
                                max={1000000}
                                value={deltas[o.id] ?? 0}
                                onChange={(e) => setDeltas({ ...deltas, [o.id]: Number(e.target.value) })}
                              />
                            ) : (
                              details.poll.adjustments[o.id] ?? 0
                            )}
                          </td>
                          <td>{(details.counts[o.id] ?? 0) + (deltas[o.id] ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canCorrect ? (
                  <div className="np-polls-correction">
                    <p className="np-polls-hint">
                      ± е отклонението от реалния брой, не новият брой. Реалните гласове остават непроменени. Промяната се обозначава публично и автоматично се записва с вашето име, дата и точните стойности.
                    </p>
                    <button disabled={busy || dirty || !correctionsDirty} onClick={() => void save(true)}>
                      Запиши корекциите
                    </button>
                  </div>
                ) : null}

                <div className="np-polls-section-head">
                  <h3>Регистър на реалните гласове</h3>
                  <span>Без имена и сурови IP адреси</span>
                </div>
                {details.votes.length === 0 ? (
                  <p className="np-polls-hint">Все още няма гласове.</p>
                ) : (
                  <div className="np-polls-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>№</th>
                          <th>Отговор</th>
                          <th>Получен на</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.votes.map((v) => (
                          <tr key={v.id}>
                            <td>{v.id}</td>
                            <td>{details.poll.options.find((o) => o.id === v.optionId)?.label}</td>
                            <td>{date(v.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tab === "history" && details && (
              <div className="np-polls-editor">
                <p className="np-polls-hint">
                  Всяко създаване, редакция и корекция има неизменим запис. Историята не се изтрива при архивиране.
                </p>
                {details.revisions.map((r) => (
                  <details key={r.id} className="np-polls-revision">
                    <summary>
                      <strong>{r.actorName}</strong>
                      <span>{r.reason}</span>
                      <small>{date(r.createdAt)}</small>
                    </summary>
                    <h3>{r.snapshot.question}</h3>
                    <p>
                      {STATUS_NAMES[r.snapshot.status]} · {r.snapshot.featured ? "Избрана за началната" : "Не е на началната"}
                    </p>
                    {r.snapshot.options.map((o) => (
                      <p key={o.id}>
                        {o.label} <strong>корекция {r.snapshot.adjustments[o.id] ?? 0}</strong>
                      </p>
                    ))}
                  </details>
                ))}
              </div>
            )}

            {tab !== "edit" && details && (
              <div className="np-polls-pagination">
                <button disabled={busy || page === 0} onClick={() => void open(details.poll.id, page - 1)}>
                  ← Предишни
                </button>
                <span>Страница {page + 1}</span>
                <button
                  disabled={busy || !(tab === "results" ? details.moreVotes : details.moreRevisions)}
                  onClick={() => void open(details.poll.id, page + 1)}
                >
                  Следващи →
                </button>
              </div>
            )}
          </>
        )}

        {notice ? <p className="np-polls-notice" role="status">{notice}</p> : null}
      </div>
    </div>
  );
}