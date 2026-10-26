"use client";
import { useEffect, useState } from "react";
import { CITY_SAVED_KEY, CITY_SAVED_CHANGE, parseSavedEvents, toggleSavedEvent } from "@/lib/city-guide/saved-events";

export function useCitySaved() {
  const [saved, setSaved] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const sync = () => { try { setSaved(parseSavedEvents(localStorage.getItem(CITY_SAVED_KEY))); } catch { setError("Запазването не е достъпно в този браузър."); } setReady(true); };
    sync(); window.addEventListener("storage", sync); window.addEventListener(CITY_SAVED_CHANGE, sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener(CITY_SAVED_CHANGE, sync); };
  }, []);
  const toggle = (key: string) => {
    try {
      const next = toggleSavedEvent(parseSavedEvents(localStorage.getItem(CITY_SAVED_KEY)), key);
      localStorage.setItem(CITY_SAVED_KEY, JSON.stringify(next)); setSaved(next); setError("");
      window.dispatchEvent(new Event(CITY_SAVED_CHANGE));
    } catch { setError("Събитието не е запазено. Провери настройките за съхранение на браузъра."); }
  };
  return { saved, ready, error, toggle };
}
