"use client";

import { useEffect, useState } from "react";
import { REPORT_KIND_LABELS, reportKinds, type ReportKind } from "@/lib/livepoint/forms/schema";
import { MegaphoneIcon } from "../icons";
import { Choice, ConsentRow, Field, SubmissionIntro, SubmissionSuccess, SubmitButton, TextArea, TextField } from "./livepoint-field";

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
    onDirtyChange(Boolean(kind !== "road" || place || description || contact || consent) && !reference);
  }, [kind, place, description, contact, consent, reference, onDirtyChange]);

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
      <SubmissionSuccess
        title="Сигналът е приет за преглед"
        reference={reference}
        description="Редакцията ще прегледа подадената информация. Нищо не се публикува автоматично."
      />
    );
  }

  return (
    <form className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)] lg:gap-6" onSubmit={onSubmit}>
      <SubmissionIntro
        tone="report"
        icon={<MegaphoneIcon width={24} height={24} />}
        eyebrow="Сигнал до редакцията"
        title="Видяхте проблем? Кажете ни къде и какво."
        description="Няколко точни подробности помагат на редакцията да провери информацията."
        points={["Изберете вид и посочете мястото.", "Опишете кога и какво сте видели.", "Редакцията преглежда сигнала преди публикация."]}
        footer={
          <div className="rounded-xl border border-accent/15 bg-surface/85 p-3.5 text-xs leading-relaxed text-body">
            <strong className="block text-sm text-ink">При непосредствена опасност</strong>
            Формата не е аварийна служба. Обадете се на <a href="tel:112" className="font-extrabold text-link underline underline-offset-2">112</a>.
          </div>
        }
      />
      <div className="flex min-w-0 flex-col gap-4">
        <div className="border-b border-line pb-3">
          <p className="text-base font-extrabold tracking-tight text-ink">Детайли за сигнала</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">Попълнете основното. Контактът е по желание.</p>
        </div>
        <div>
          <p className="mb-2 text-[0.8125rem] font-bold text-ink">Какъв е сигналът?</p>
          <Choice
            name="Вид на сигнала"
            value={kind}
            options={reportKinds.map((id) => ({ id, label: REPORT_KIND_LABELS[id] }))}
            onChange={setKind}
          />
        </div>
        <Field label="Къде се случва?">
          <TextField required minLength={2} maxLength={200} value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Улица, квартал или ориентир" />
        </Field>
        <Field label="Какво се случва?" hint="Поне 20 знака. Посочете и кога сте го видели.">
          <TextArea
            required
            minLength={20}
            maxLength={4000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            placeholder="Опишете конкретно това, което сте видели…"
          />
        </Field>
        <Field label="Контакт за уточнение (по желание)">
          <TextField maxLength={200} value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Имейл или телефон" />
        </Field>
        <p className="rounded-xl bg-surface-2/70 px-3.5 py-2.5 text-xs leading-relaxed text-muted">Снимки и видео още не се приемат през тази форма.</p>
        <ConsentRow checked={consent} onChange={setConsent}>
          Разбирам, че редакцията преглежда сигнала и личните ми данни не се публикуват.
        </ConsentRow>
        {error ? <p role="alert" className="rounded-xl border border-accent/25 bg-accent/5 px-3.5 py-3 text-sm font-semibold text-ink">{error}</p> : null}
        <div className="np-lp-form-actions flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
          <p className="text-xs leading-relaxed text-muted">Изпраща се само до редакцията.</p>
          <SubmitButton pending={pending} disabled={!consent}>Изпрати сигнала</SubmitButton>
        </div>
      </div>
    </form>
  );
}
