"use client";

import { useEffect, useId, useState } from "react";
import { MAX_PHOTOS, PHOTO_ACCEPT, photoSelectionError } from "@/lib/livepoint/forms/photos";

function PhotoPreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return url ? <img src={url} alt="" className="h-20 w-full object-cover" /> : <div className="h-20 bg-surface-2" />;
}

export function PhotoPicker({ photos, onChange, disabled }: { photos: File[]; onChange: (files: File[]) => void; disabled: boolean }) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-line bg-surface-2/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <p id={`${id}-title`} className="text-[0.8125rem] font-bold text-ink">Снимки <span className="font-normal text-muted">(по желание)</span></p>
        <span className="rounded-full bg-accent/8 px-2.5 py-1 text-xs font-bold text-accent">{photos.length} / {MAX_PHOTOS}</span>
      </div>
      <p id={`${id}-hint`} className="mb-3 mt-1 text-xs leading-relaxed text-muted">До 5 снимки · до 10 MB всяка · JPEG, PNG, WebP. Снимките се изпращат само до редакцията.</p>
      <input id={id} type="file" accept={PHOTO_ACCEPT} multiple disabled={disabled || photos.length === MAX_PHOTOS}
        aria-label="Добави снимки"
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} aria-invalid={!!error}
        className="peer sr-only"
        onChange={event => {
          const next = [...photos, ...Array.from(event.target.files ?? [])];
          const message = photoSelectionError(next);
          setError(message);
          if (!message) onChange(next);
          event.target.value = "";
        }} />
      <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-accent/15 bg-accent/8 px-4 py-2.5 text-xs font-bold text-accent transition-colors hover:bg-accent/15 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-default peer-disabled:opacity-50"><span aria-hidden="true" className="text-lg leading-none">+</span>Добави снимки</label>
      {photos.length ? <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{photos.map((file, index) => (
        <li key={`${file.name}-${file.lastModified}-${index}`} className="relative overflow-hidden rounded-xl border border-line bg-surface">
          <PhotoPreview file={file} />
          <div className="px-2 py-1.5"><p className="truncate text-xs font-semibold text-ink">{file.name}</p><p className="text-[0.6875rem] text-muted">{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</p></div>
          <button type="button" disabled={disabled} onClick={() => { onChange(photos.filter((_, i) => i !== index)); setError(null); }} aria-label={`Премахни снимка ${index + 1}`} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-surface/95 text-lg text-ink shadow-sm focus-visible:outline-2 focus-visible:outline-accent">×</button>
        </li>
      ))}</ul> : null}
      {error ? <p id={`${id}-error`} role="alert" className="mt-2 text-xs font-semibold text-ink">{error}</p> : null}
    </section>
  );
}
