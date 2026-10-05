"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@/lib/paths";
import type { StoryThemeListItem } from "@/lib/story-theme-types";

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value);
}

function statusLabel(item: StoryThemeListItem) {
  if (item.isPublished) return { text: "Публикувана", cls: "bg-accent/15 text-accent" };
  return { text: "Чернова", cls: "bg-warning/15 text-warning" };
}

type PendingAction =
  | { kind: "publish"; id: string; label: string }
  | { kind: "unpublish"; id: string; label: string }
  | { kind: "delete"; id: string; label: string }
  | null;

export function StoryThemesDesk({ themes }: { themes: StoryThemeListItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const call = async (action: "publish" | "unpublish" | "delete", id: string) => {
    setPendingAction(null);
    setBusyId(id);
    setFeedback(null);
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: { message?: string } }).error?.message ?? `Грешка ${res.status}`);
      }
      const messages = {
        publish: "Темата е публикувана.",
        unpublish: "Темата е свалена от публикация.",
        delete: "Темата е изтрита.",
      } as const;
      setFeedback({ kind: "ok", text: messages[action] });
      startTransition(() => router.refresh());
    } catch (err) {
      setFeedback({ kind: "err", text: err instanceof Error ? err.message : "Грешка при заявката." });
    } finally {
      setBusyId(null);
    }
  };

  const confirm = (action: "publish" | "unpublish" | "delete", id: string, label: string) => {
    const messages = {
      publish: `Публикувай „${label}"?`,
      unpublish: `Свали от публикация „${label}"?`,
      delete: `Изтрий „${label}"? Действието е необратимо.`,
    } as const;
    setPendingAction({ kind: action, id, label: messages[action] });
  };

  return (
    <div className="flex flex-col gap-3">
      {feedback ? (
        <div
          role={feedback.kind === "err" ? "alert" : "status"}
          className={`np-card p-3 text-sm ${feedback.kind === "err" ? "border-danger/40 text-danger" : "border-success/40 text-success"}`}
        >
          {feedback.text}
        </div>
      ) : null}
      <div className="np-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-xs font-bold tracking-wide text-muted uppercase">
              <th scope="col" className="px-4 py-3 text-left">Заглавие</th>
              <th scope="col" className="px-4 py-3 text-right">Статии</th>
              <th scope="col" className="px-4 py-3 text-left">Състояние</th>
              <th scope="col" className="px-4 py-3 text-left">Обновена</th>
              <th scope="col" className="px-4 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {themes.map((theme) => {
              const status = statusLabel(theme);
              const isBusy = busyId === theme.id || pending;
              return (
                <tr key={theme.id} className="border-b border-line/60 last:border-b-0">
                  <td className="px-4 py-3">
                    <Link
                      href={withBase(`/stories/${theme.id}`)}
                      className="font-bold text-ink hover:text-accent"
                    >
                      {theme.title}
                    </Link>
                    <div className="mt-0.5 text-xs text-muted">/{theme.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{theme.articleCount}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${status.cls}`}>{status.text}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{formatDate(theme.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      {theme.isPublished ? (
                        <Link href={withBase(`/temi/${theme.slug}/`)} className="np-btn np-btn-secondary !h-8 !px-3 !text-xs" target="_blank" rel="noreferrer">
                          Виж
                        </Link>
                      ) : null}
                      <Link href={withBase(`/stories/${theme.id}/preview`)} className="np-btn np-btn-secondary !h-8 !px-3 !text-xs">
                        Preview
                      </Link>
                      {theme.isPublished ? (
                        <button
                          type="button"
                          onClick={() => confirm("unpublish", theme.id, theme.title)}
                          disabled={isBusy}
                          className="np-btn np-btn-secondary !h-8 !px-3 !text-xs"
                        >
                          Свали
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => confirm("publish", theme.id, theme.title)}
                          disabled={isBusy}
                          className="np-btn np-btn-primary !h-8 !px-3 !text-xs"
                        >
                          Публикувай
                        </button>
                      )}
                      <Link href={withBase(`/stories/${theme.id}`)} className="np-btn np-btn-secondary !h-8 !px-3 !text-xs">
                        Редакция
                      </Link>
                      <button
                        type="button"
                        onClick={() => confirm("delete", theme.id, theme.title)}
                        disabled={isBusy}
                        className="np-btn np-btn-secondary !h-8 !px-3 !text-xs text-danger"
                      >
                        Изтрий
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pendingAction ? (
        <ConfirmDialog
          message={pendingAction.label}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            const id = pendingAction.id;
            void call(pendingAction.kind, id);
          }}
          destructive={pendingAction.kind === "delete"}
        />
      ) : null}
    </div>
  );
}

function ConfirmDialog({
  message,
  onCancel,
  onConfirm,
  destructive,
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  destructive: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Потвърждение"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="np-card flex max-w-md flex-col gap-4 p-5"
      >
        <p className="text-sm text-body">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="np-btn np-btn-secondary">
            Отказ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={destructive ? "np-btn bg-danger text-on-accent" : "np-btn np-btn-primary"}
          >
            Потвърди
          </button>
        </div>
      </div>
    </div>
  );
}
