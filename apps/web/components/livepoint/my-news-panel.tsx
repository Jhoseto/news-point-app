"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Field, SubmitButton, TextArea, TextField } from "./livepoint-field";

export function MyNewsPanel({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [workingTitle, setWorkingTitle] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [whereWhen, setWhereWhen] = useState("");
  const [publishName, setPublishName] = useState("");
  const [contact, setContact] = useState("");
  const [rightsAck, setRightsAck] = useState(false);
  const [factsAck, setFactsAck] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    const dirty = Boolean(workingTitle || whatHappened || whereWhen || publishName || contact) && !reference;
    onDirtyChange(dirty);
  }, [workingTitle, whatHappened, whereWhen, publishName, contact, reference, onDirtyChange]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/livepoint/my-news/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workingTitle, whatHappened, whereWhen, publishName, contact, rightsAck, factsAck }),
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
      <div className="py-2">
        <p className="text-base font-extrabold text-ink">Материалът е приет за преглед</p>
        <p className="mt-2 text-sm text-body">
          Номер: <span className="font-bold">{reference}</span>. Публикуване има само след редакционно одобрение.
        </p>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <p className="text-sm text-body">Разкажете какво сте видели или заснели. Това не се публикува автоматично.</p>
      <Field label="Работно заглавие">
        <TextField required value={workingTitle} onChange={(e) => setWorkingTitle(e.target.value)} />
      </Field>
      <Field label="Какво се е случило">
        <TextArea required value={whatHappened} onChange={(e) => setWhatHappened(e.target.value)} rows={5} />
      </Field>
      <Field label="Къде и кога">
        <TextField required value={whereWhen} onChange={(e) => setWhereWhen(e.target.value)} />
      </Field>
      <Field label="Име или псевдоним за публикуване">
        <TextField required value={publishName} onChange={(e) => setPublishName(e.target.value)} />
      </Field>
      <Field label="Предпочитан контакт">
        <TextField required value={contact} onChange={(e) => setContact(e.target.value)} />
      </Field>
      <p className="text-xs text-muted">Медийни файлове още не се приемат през тази форма.</p>
      <label className="flex items-start gap-2.5 text-sm text-body">
        <input type="checkbox" checked={factsAck} onChange={(e) => setFactsAck(e.target.checked)} required className="mt-1" />
        Описвам факти, които съм видял/а или мога да потвърдя.
      </label>
      <label className="flex items-start gap-2.5 text-sm text-body">
        <input type="checkbox" checked={rightsAck} onChange={(e) => setRightsAck(e.target.checked)} required className="mt-1" />
        Имам право да споделя материала и приемам редакционен преглед преди публикация.
      </label>
      {error ? <p className="text-sm font-semibold text-logo">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} disabled={!rightsAck || !factsAck}>
          Изпрати към редакцията
        </SubmitButton>
        <Link href="/livepoint/my-news/" className="text-sm font-semibold text-link">
          Пълна форма
        </Link>
      </div>
    </form>
  );
}
