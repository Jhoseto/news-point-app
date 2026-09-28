"use client";

import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { REPORT_KIND_LABELS, reportKinds, reportSchema, type ReportKind } from "@/lib/livepoint/forms/schema";
import { CONTACT_ERROR, isValidReportContact } from "@/lib/livepoint/forms/contact";
import type { ReportLocation } from "@/lib/livepoint/forms/location";
import { submissionFormData } from "@/lib/livepoint/forms/photos";
import { PhotoPicker } from "./photo-picker";
import { MapIcon, MegaphoneIcon, PinIcon } from "../icons";
import { Choice, ConsentRow, Field, npField, SubmissionIntro, SubmissionSuccess, SubmitButton, TextArea, TextField } from "./livepoint-field";

const LocationPicker = lazy(() => import("./report-location-picker").then(module => ({ default: module.ReportLocationPicker })));

const noopDirtyChange = (_dirty: boolean) => {};

export function ReportPanel({ onDirtyChange = noopDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const [kind, setKind] = useState<ReportKind>("road");
  const [location, setLocation] = useState<ReportLocation | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const locationButton = useRef<HTMLButtonElement>(null);
  const contactId = useId();
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    onDirtyChange(Boolean(kind !== "road" || location || description || contact || consent || photos.length) && !reference);
  }, [kind, location, description, contact, consent, photos.length, reference, onDirtyChange]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const input = { kind, place: location?.place, position: location?.position, description, contact, consent };
    const parsed = reportSchema.safeParse(input);
    if (!parsed.success) {
      if (!location) {
        setError("Посочете точното място на сигнала върху картата.");
        locationButton.current?.focus();
      } else setError(!isValidReportContact(contact) ? CONTACT_ERROR : "Проверете описанието и съгласието във формата.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/livepoint/report/", {
        method: "POST",
        body: submissionFormData(parsed.data, photos),
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
            Формата не е аварийна служба. Обадете се на <a href="tel:112" className="inline-flex min-h-11 min-w-11 items-center font-extrabold text-link underline underline-offset-2">112</a>.
          </div>
        }
      />
      <div className="flex min-w-0 flex-col gap-4">
        <div className="border-b border-line pb-3">
          <p className="text-base font-extrabold tracking-tight text-ink">Детайли за сигнала</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">Мястото, описанието и контактът са задължителни.</p>
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
        <Field label="Къде се случва?" hint={location ? "Точката е отбелязана. Натиснете, за да я промените." : "Отворете картата и отбележете точната точка."}>
          <button ref={locationButton} type="button" aria-haspopup="dialog" aria-expanded={pickerOpen} onClick={() => setPickerOpen(true)} className={`${npField} flex min-h-12 items-center gap-3 py-3 text-left`}>
            <PinIcon width={19} height={19} className="shrink-0 text-accent" />
            <span className={`min-w-0 flex-1 ${location ? "" : "text-muted"}`}>{location?.place ?? "Посочете мястото на картата"}</span>
            <MapIcon width={18} height={18} className="shrink-0 text-muted" />
          </button>
          {location ? <span className="text-[0.6875rem] text-muted">{location.position.lat.toFixed(5)}, {location.position.lon.toFixed(5)}</span> : null}
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
        <Field label="Телефон или имейл" hint="Телефон с + или 0 (напр. +359 888 123 456 или 0888 123 456), или name@example.com.">
          <TextField required maxLength={200} autoComplete="off" autoCapitalize="none" spellCheck={false} value={contact} aria-invalid={!!contactError} aria-describedby={contactError ? contactId : undefined}
            onChange={(event) => {
              const value = event.target.value;
              setContact(value);
              const message = isValidReportContact(value) ? "" : CONTACT_ERROR;
              event.target.setCustomValidity(message);
              if (contactError) setContactError(message || null);
            }}
            onBlur={(event) => {
              const message = isValidReportContact(event.target.value) ? "" : CONTACT_ERROR;
              event.target.setCustomValidity(message);
              setContactError(message || null);
            }}
            onInvalid={() => setContactError(CONTACT_ERROR)} placeholder="Телефон или имейл" />
          {contactError ? <span id={contactId} role="alert" className="rounded-lg bg-accent/5 px-3 py-2 text-xs font-semibold text-ink">{contactError}</span> : null}
        </Field>
        <PhotoPicker photos={photos} onChange={setPhotos} disabled={pending} />
        <ConsentRow checked={consent} onChange={setConsent}>
          Разбирам, че редакцията преглежда сигнала и личните ми данни не се публикуват.
        </ConsentRow>
        {error ? <p role="alert" className="rounded-xl border border-accent/25 bg-accent/5 px-3.5 py-3 text-sm font-semibold text-ink">{error}</p> : null}
        <div className="np-lp-form-actions flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
          <p className="text-xs leading-relaxed text-muted">Изпраща се само до редакцията.</p>
          <SubmitButton pending={pending} disabled={!consent}>Изпрати сигнала</SubmitButton>
        </div>
      </div>
      {pickerOpen ? <Suspense fallback={<p role="status" className="text-sm text-muted">Отваряне на картата…</p>}><LocationPicker initial={location} onClose={() => setPickerOpen(false)} onConfirm={value => { setLocation(value); setPickerOpen(false); setError(null); }} /></Suspense> : null}
    </form>
  );
}
