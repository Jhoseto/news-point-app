"use client";

import { useEffect, useState } from "react";
import { submissionFormData } from "@/lib/livepoint/forms/photos";
import { PhotoPicker } from "./photo-picker";
import { FeatherIcon } from "../icons";
import { ConsentRow, Field, SubmissionIntro, SubmissionSuccess, SubmitButton, TextArea, TextField } from "./livepoint-field";

const noopDirtyChange = (_dirty: boolean) => {};

export function MyNewsPanel({ onDirtyChange = noopDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const [workingTitle, setWorkingTitle] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [whereWhen, setWhereWhen] = useState("");
  const [publishName, setPublishName] = useState("");
  const [contact, setContact] = useState("");
  const [rightsAck, setRightsAck] = useState(false);
  const [factsAck, setFactsAck] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    const dirty = Boolean(workingTitle || whatHappened || whereWhen || publishName || contact || rightsAck || factsAck || photos.length) && !reference;
    onDirtyChange(dirty);
  }, [workingTitle, whatHappened, whereWhen, publishName, contact, rightsAck, factsAck, photos.length, reference, onDirtyChange]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/livepoint/my-news/", {
        method: "POST",
        body: submissionFormData({ workingTitle, whatHappened, whereWhen, publishName, contact, rightsAck, factsAck }, photos),
      });
      const json = (await response.json()) as { ok?: boolean; reference?: string; error?: string };
      if (!response.ok || !json.ok || !json.reference) {
        setError(json.error ?? "Материалът не беше приет.");
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
        title="Материалът е приет за преглед"
        reference={reference}
        description="Редакцията ще прегледа разказа ви. Публикуване има само след редакционно одобрение."
      />
    );
  }

  return (
    <form className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)] lg:gap-6" onSubmit={onSubmit}>
      <SubmissionIntro
        tone="story"
        icon={<FeatherIcon width={24} height={24} />}
        eyebrow="Вашият разказ"
        title="Разкажете историята така, както я видяхте."
        description="Изпратете предложение за новина с проверими подробности. Редакцията решава дали и как да го публикува."
        points={["Дайте кратко работно заглавие.", "Опишете фактите, мястото и времето.", "Оставете контакт за въпроси от редакцията."]}
        footer={
          <p className="rounded-xl border border-accent/15 bg-surface/85 p-3.5 text-xs leading-relaxed text-body">
            Публикацията е възможна само след редакционен преглед и одобрение.
          </p>
        }
      />
      <div className="flex min-w-0 flex-col gap-4">
        <div className="border-b border-line pb-3">
          <p className="text-base font-extrabold tracking-tight text-ink">Вашият материал</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">Напишете фактите ясно. Заглавието може да е работно.</p>
        </div>
        <Field label="Работно заглавие">
          <TextField required minLength={3} maxLength={160} value={workingTitle} onChange={(event) => setWorkingTitle(event.target.value)} placeholder="Накратко за какво е новината" />
        </Field>
        <Field label="Какво се е случило?" hint="Поне 40 знака. Разкажете само това, което можете да потвърдите.">
          <TextArea required minLength={40} maxLength={8000} value={whatHappened} onChange={(event) => setWhatHappened(event.target.value)} rows={5} placeholder="Разкажете историята в няколко ясни изречения…" />
        </Field>
        <Field label="Къде и кога?">
          <TextField required minLength={3} maxLength={400} value={whereWhen} onChange={(event) => setWhereWhen(event.target.value)} placeholder="Място, дата и приблизителен час" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Име или псевдоним">
            <TextField required minLength={2} maxLength={120} value={publishName} onChange={(event) => setPublishName(event.target.value)} placeholder="Как да ви представим" />
          </Field>
          <Field label="Контакт за редакцията">
            <TextField required minLength={3} maxLength={200} value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Имейл или телефон" />
          </Field>
        </div>
        <PhotoPicker photos={photos} onChange={setPhotos} disabled={pending} />
        <div className="space-y-2">
          <ConsentRow checked={factsAck} onChange={setFactsAck}>Описвам факти, които съм видял/а или мога да потвърдя.</ConsentRow>
          <ConsentRow checked={rightsAck} onChange={setRightsAck}>Имам право да споделя материала и приемам редакционен преглед преди публикация.</ConsentRow>
        </div>
        {error ? <p role="alert" className="rounded-xl border border-accent/25 bg-accent/5 px-3.5 py-3 text-sm font-semibold text-ink">{error}</p> : null}
        <div className="np-lp-form-actions flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
          <p className="text-xs leading-relaxed text-muted">Не се публикува автоматично.</p>
          <SubmitButton pending={pending} disabled={!rightsAck || !factsAck}>Изпрати към редакцията</SubmitButton>
        </div>
      </div>
    </form>
  );
}
