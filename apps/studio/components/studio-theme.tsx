"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "np-theme";
const THEME_EVENT = "np-studio-theme-change";

// Match the public site's saved preference and system default before first paint.
const THEME_SCRIPT = `(()=>{let value;try{value=localStorage.getItem("np-theme")}catch{}const theme=value==="dark"||value==="light"?value:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme})();`;
const emptySubscribe = () => () => {};

export function StudioThemeScript() {
  const serverRender = useSyncExternalStore(emptySubscribe, () => false, () => true);
  if (!serverRender) return null;
  return <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}

function resolvedTheme(): "light" | "dark" {
  try {
    const preference = localStorage.getItem(STORAGE_KEY);
    if (preference === "light" || preference === "dark") return preference;
  } catch { /* Keep the system default when storage is unavailable. */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function StudioThemeToggle({ compact = false, surface = false }: { compact?: boolean; surface?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const sync = () => {
      const next = resolvedTheme();
      applyTheme(next);
      setTheme(next);
    };
    const onThemeEvent = () => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(THEME_EVENT, onThemeEvent);
    media.addEventListener("change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(THEME_EVENT, onThemeEvent);
      media.removeEventListener("change", sync);
    };
  }, []);

  const toggle = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* The current tab still switches. */ }
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Включи светла тема" : "Включи тъмна тема"}
      aria-pressed={theme === "dark"}
      data-help="Сменя светлата и тъмната тема на Studio. Изборът се запазва и за сайта."
      className={`np-studio-theme-toggle ${compact ? "np-studio-theme-toggle--compact" : ""} ${surface ? "np-studio-theme-toggle--surface" : ""}`}
    >
      <span className="np-studio-theme-track" aria-hidden="true">
        <svg className="np-studio-theme-sun" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
        <svg className="np-studio-theme-moon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.2 15.3A8.5 8.5 0 0 1 8.7 3.8 8.5 8.5 0 1 0 20.2 15.3Z" /></svg>
        <span className="np-studio-theme-knob">
          <svg className="np-studio-theme-knob-sun" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
          <svg className="np-studio-theme-knob-moon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.2 15.3A8.5 8.5 0 0 1 8.7 3.8 8.5 8.5 0 1 0 20.2 15.3Z" /></svg>
        </span>
      </span>
      {compact ? null : <span>Тема</span>}
    </button>
  );
}
