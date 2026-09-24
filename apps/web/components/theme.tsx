"use client";

import { useCallback, useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";

import { THEME_STORAGE_KEY as STORAGE_KEY } from "./theme-script";

type Theme = "light" | "dark";
type Preference = Theme | "system";

function systemTheme(): Theme {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readPreference(): Preference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function apply(preference: Preference) {
  const theme = preference === "system" ? systemTheme() : preference;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  try {
    if (preference === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {}
}

function useThemePreference() {
  const [preference, setPreference] = useState<Preference>("system");

  useEffect(() => {
    setPreference(readPreference());
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readPreference() === "system") apply("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const choose = useCallback((next: Preference) => {
    apply(next);
    setPreference(next);
  }, []);

  return [preference, choose] as const;
}

/** Switch in the header, as in the mockups. */
export function ThemeToggle() {
  const [, choose] = useThemePreference();
  const toggle = () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    choose(current === "dark" ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Смени светъл/тъмен режим"
      className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border border-line bg-surface-2 p-0.5 transition-colors"
    >
      <span className="absolute inset-y-0 left-1.5 flex items-center text-faint dark:text-muted">
        <SunIcon width={14} height={14} />
      </span>
      <span className="absolute inset-y-0 right-1.5 flex items-center text-faint">
        <MoonIcon width={14} height={14} />
      </span>
      <span className="relative z-10 flex size-7 items-center justify-center rounded-full bg-surface text-accent shadow-card transition-transform duration-300 dark:translate-x-6 dark:bg-accent dark:text-on-accent">
        <SunIcon width={15} height={15} className="dark:hidden" />
        <MoonIcon width={15} height={15} className="hidden dark:block" />
      </span>
    </button>
  );
}

const OPTIONS: { value: Preference; label: string }[] = [
  { value: "light", label: "Светъл" },
  { value: "dark", label: "Тъмен" },
  { value: "system", label: "Системен" },
];

/** Three-way choice for the mobile menu. */
export function ThemeChoice() {
  const [preference, choose] = useThemePreference();
  return (
    <div role="radiogroup" aria-label="Режим на показване" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={preference === option.value}
          onClick={() => choose(option.value)}
          className="rounded-lg px-2 py-2 text-sm font-semibold text-muted aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-card"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
