"use client";

import { chooseReaderPreferences, useReaderPreferences } from "./reader-preferences";
import { DEFAULT_PREFERENCES, type ReaderPreferences } from "@/lib/reader-preferences";
import { PushSettings } from "./push-settings";
import { useId } from "react";

const groups = [
  { key: "theme", title: "Цветова тема", hint: "Следвайте устройството или изберете тема.", options: [
    { value: "system", label: "Системна", detail: "" },
    { value: "light", label: "Светла", detail: "" },
    { value: "dark", label: "Тъмна", detail: "" },
  ] },
  { key: "text", title: "Размер при четене", hint: "Размерът важи за текста на статиите.", options: [
    { value: "standard", label: "Стандартен", detail: "100%" },
    { value: "larger", label: "По-голям", detail: "115%" },
    { value: "largest", label: "Голям", detail: "130%" },
  ] },
  { key: "motion", title: "Движение", hint: "Спира автоматичното движение. Системното намалено движение винаги се спазва.", options: [
    { value: "system", label: "Устройство", detail: "" },
    { value: "reduce", label: "Намалено", detail: "" },
  ] },
] as const;

export function SettingsPanel({ compact = false }: { compact?: boolean }) {
  const preferences = useReaderPreferences();
  const id = useId();
  const tight = compact;
  const gap = tight ? "gap-2" : "gap-6";
  const card = tight ? "np-card min-w-0 p-2.5 sm:p-3" : "np-card min-w-0 p-5 sm:p-7";
  const legend = tight ? "float-left mb-0.5 w-full text-xs font-extrabold text-ink" : "float-left mb-2 w-full text-lg font-extrabold text-ink";
  const hintCls = tight ? "clear-both mb-2 text-[11px] leading-snug text-muted" : "clear-both mb-5 text-sm leading-relaxed text-muted";
  const optGrid = tight ? "grid gap-1.5" : "grid gap-3";
  const optCols = (n: number) => (tight ? (n === 3 ? "grid-cols-3" : "grid-cols-2") : n === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2");
  const labelCls = tight
    ? "flex min-h-9 min-w-0 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface-2 px-1.5 py-1.5 text-center has-checked:border-accent has-checked:bg-accent/5 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
    : "flex min-w-0 cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4 has-checked:border-accent has-checked:bg-accent/5";

  return (
    <div className={`grid min-w-0 ${gap}`}>
      <PushSettings compact={tight} />
      {groups.map((group) => (
        <fieldset key={group.key} className={card} aria-describedby={`${id}-${group.key}-hint`}>
          <legend className={legend}>{group.title}</legend>
          <p id={`${id}-${group.key}-hint`} className={hintCls}>{tight ? group.hint : group.hint}</p>
          <div className={`${optGrid} ${optCols(group.options.length)}`}>
            {group.options.map((option) => (
              <label key={option.value} className={labelCls}>
                <input
                  type="radio"
                  name={`${id}-${group.key}`}
                  value={option.value}
                  aria-label={tight && group.key === "text" ? `${option.label} ${option.detail}` : option.label}
                  checked={preferences[group.key] === option.value}
                  onChange={() => chooseReaderPreferences({ [group.key]: option.value } as Partial<ReaderPreferences>)}
                  className={tight ? "sr-only" : "mt-1 size-4 shrink-0 accent-accent"}
                />
                <span className="min-w-0">
                  <span className={`block font-bold text-ink ${tight ? "text-[11px]" : "text-sm"}`}>
                    {tight && group.key === "text" ? option.detail : option.label}
                  </span>
                  {!tight && option.detail ? (
                    <span className="mt-1 block text-xs leading-relaxed text-muted">{option.detail}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <section aria-labelledby={`${id}-preview`} className={`${card} overflow-hidden`}>
        <h2 id={`${id}-preview`} className={`font-bold tracking-wide text-muted uppercase ${tight ? "mb-1.5 text-[10px]" : "mb-4 text-xs"}`}>
          Преглед
        </h2>
        <div className={`np-prose ${tight ? "np-settings-preview" : ""}`}>
          <p>{tight ? "Така изглежда текстът в статиите при избрания размер." : "Новините са по-приятни за четене, когато изгледът е удобен за вас."}</p>
        </div>
      </section>
      <div className={`flex flex-wrap items-center justify-between ${tight ? "gap-1.5" : "gap-4"}`}>
        <p role="status" className={`text-muted ${tight ? "max-w-[14rem] text-[10px] leading-snug" : "max-w-lg text-sm"}`}>
          {preferences.storageAvailable
            ? tight
              ? "Запазва се в този браузър."
              : "Настройките се запазват автоматично само в този браузър."
            : "Без локално запазване — до презареждане."}
        </p>
        <button
          type="button"
          onClick={() => chooseReaderPreferences(DEFAULT_PREFERENCES)}
          className={`rounded-lg border border-line bg-surface font-bold text-ink hover:bg-surface-2 ${tight ? "min-h-8 px-2.5 py-1.5 text-[10px]" : "px-4 py-3 text-sm"}`}
        >
          {tight ? "Стандартни" : "Върни стандартните настройки"}
        </button>
      </div>
    </div>
  );
}
