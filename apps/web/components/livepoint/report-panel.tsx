"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { REPORT_KIND_LABELS, reportKinds, type ReportKind } from "@/lib/livepoint/forms/schema";
import { Choice, Field, SubmitButton, TextArea, TextField } from "./livepoint-field";

export function ReportPanel({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [kind, setKind] = useState<ReportKind>("road");
  const [place, setPlace] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    onDirtyChange(Boolean(place || description || contact) && !reference);
  }, [place, description, contact, reference, onDirtyChange]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/livepoint/report/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, place, description, contact, consent }),
      });
      const json = (await response.json()) as { ok?: boolean; reference?: string; error?: string };
      if (!response.ok || !json.ok || !json.reference) {
        setError(json.error ?? "Сигналът не беше приет.");
        return;
      }
      setReference(json.reference);
      onDirtyChange(false);
    } catch {
      setError("Мрежова грешка. Опитайте отново.");
    } finally {
      setPending(false);
    }
  }

  if (reference) {
    return (
      <div className="py-2">
        <p className="text-base font-extrabold text-ink">Сигналът е приет за преглед</p>
        <p className="mt-2 text-sm text-body">
          Номер: <span className="font-bold">{reference}</span>. Редакцията преглежда сигналите — нищо не се публикува
          автоматично.
        </p>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <p className="text-sm text-body">
        Формата не е аварийна служба. При непосредствена опасност се обадете на{" "}
        <a href="tel:112" className="font-bold text-link">
          112
        </a>
        .
      </p>
      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink">Вид</p>
        <Choice
          name="Вид"
          value={kind}
          options={reportKinds.map((id) => ({ id, label: REPORT_KIND_LABELS[id] }))}
          onChange={setKind}
        />
      </div>
      <Field label="Място">
        <TextField required value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Улица, квартал или ориентир" />
      </Field>
      <Field label="Описание" hint="Минимум 20 знака. Снимки още не се приемат тук.">
        <TextArea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Какво се случва?"
        />
      </Field>
      <Field label="Контакт (по желание)">
        <TextField value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Имейл или телефон" />
      </Field>
      <label className="flex items-start gap-2.5 text-sm text-body">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required className="mt-1" />
        Разбирам, че редакцията преглежда сигнала и личните данни не се публикуват.
      </label>
      {error ? <p className="text-sm font-semibold text-logo">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} disabled={!consent}>
          Изпрати сигнала
        </SubmitButton>
        <Link href="/livepoint/report/" className="text-sm font-semibold text-link">
          Разширена форма
        </Link>
      </div>
    </form>
  );
}
