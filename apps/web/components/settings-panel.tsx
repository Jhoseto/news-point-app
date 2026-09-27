"use client";

import { chooseReaderPreferences, useReaderPreferences } from "./reader-preferences";
import { DEFAULT_PREFERENCES, type ReaderPreferences } from "@/lib/reader-preferences";
import { useId } from "react";

const groups = [
  { key: "theme", title: "Цветова тема", hint: "Изберете своя изглед или следвайте настройката на устройството.", options: [
    { value: "system", label: "Системна", detail: "Според устройството" },
    { value: "light", label: "Светла", detail: "Светъл фон, ясни акценти" },
    { value: "dark", label: "Тъмна", detail: "Комфортен тъмен фон" },
  ] },
  { key: "text", title: "Размер при четене", hint: "Променя текста в статиите. Менютата, картите и формите запазват размера си.", options: [
    { value: "standard", label: "Стандартен", detail: "100%" },
    { value: "larger", label: "По-голям", detail: "115%" },
    { value: "largest", label: "Голям", detail: "130%" },
  ] },
  { key: "motion", title: "Движение и ефекти", hint: "Намаленото движение спира декоративните анимации и автоматичното плъзгане. Системната настройка за намалено движение винаги се спазва.", options: [
    { value: "system", label: "Според устройството", detail: "Следва системната настройка" },
    { value: "reduce", label: "Намалено движение", detail: "Спокоен изглед без автоматично движение" },
  ] },
] as const;

export function SettingsPanel({ compact = false }: { compact?: boolean }) {
  const preferences = useReaderPreferences();
  const id = useId();
  return (
    <div className={`grid min-w-0 ${compact ? "gap-3" : "gap-6"}`}>
      {groups.map((group) => (
        <fieldset key={group.key} className={`np-card min-w-0 ${compact ? "p-3 sm:p-4" : "p-5 sm:p-7"}`} aria-describedby={`${id}-${group.key}-hint`}>
          <legend className={`float-left w-full font-extrabold text-ink ${compact ? "mb-1 text-sm" : "mb-2 text-lg"}`}>{group.title}</legend>
          <p id={`${id}-${group.key}-hint`} className={`clear-both leading-relaxed text-muted ${compact ? "mb-3 text-xs" : "mb-5 text-sm"}`}>{compact ? (group.key === "theme" ? "Следвайте устройството или изберете тема." : group.key === "text" ? "Размерът важи за текста на статиите." : "Спира автоматичното движение и ефектите. Системното намалено движение винаги се спазва.") : group.hint}</p>
          <div className={`grid ${compact ? `gap-2 ${group.options.length === 3 ? "grid-cols-3" : "grid-cols-2"}` : `gap-3 ${group.options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}`}>
            {group.options.map((option) => (
              <label key={option.value} className={`flex min-w-0 cursor-pointer border border-line bg-surface-2 transition-colors has-checked:border-accent has-checked:bg-accent/5 has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-accent ${compact ? "min-h-11 items-center justify-center rounded-xl px-2 py-2 text-center" : "items-start gap-3 rounded-2xl p-4"}`}>
                <input type="radio" name={`${id}-${group.key}`} value={option.value} aria-label={compact && group.key === "text" ? `${option.label} ${option.detail}` : undefined} checked={preferences[group.key] === option.value} onChange={() => chooseReaderPreferences({ [group.key]: option.value } as Partial<ReaderPreferences>)} className={compact ? "sr-only" : "mt-1 size-4 shrink-0 accent-accent"} />
                <span className="min-w-0"><span className={`block font-bold text-ink ${compact ? "text-xs" : "text-sm"}`}>{compact && group.key === "text" ? option.detail : option.label}</span>{!compact && <span className="mt-1 block text-xs leading-relaxed text-muted">{option.detail}</span>}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <section aria-labelledby={`${id}-preview`} className={`np-card overflow-hidden ${compact ? "p-3 sm:p-4" : "p-5 sm:p-7"}`}>
        <h2 id={`${id}-preview`} className={`text-xs font-bold tracking-widest text-muted uppercase ${compact ? "mb-2" : "mb-4"}`}>Преглед на текста</h2>
        <div className={`np-prose ${compact ? "np-settings-preview" : ""}`}><p>{compact ? "Така ще изглежда текстът на статиите при избрания размер." : "Новините са по-приятни за четене, когато изгледът е удобен за вас. Изберете размера, който ви позволява да четете спокойно."}</p></div>
      </section>
      <div className={`flex flex-wrap items-center justify-between ${compact ? "gap-2" : "gap-4"}`}>
        <p role="status" className={`text-muted ${compact ? "max-w-[17rem] text-xs" : "max-w-lg text-sm"}`}>{preferences.storageAvailable ? (compact ? "Запазва се само в този браузър." : "Настройките се запазват автоматично само в този браузър.") : "Браузърът не позволява запазване. Изборът действа в тази сесия, до презареждане."}</p>
        <button type="button" onClick={() => chooseReaderPreferences(DEFAULT_PREFERENCES)} className={`rounded-xl border border-line bg-surface font-bold text-ink hover:bg-surface-2 ${compact ? "min-h-11 px-3 py-2 text-xs" : "px-4 py-3 text-sm"}`}>{compact ? "Стандартни настройки" : "Върни стандартните настройки"}</button>
      </div>
    </div>
  );
}
