"use client";

import { useEffect, useState } from "react";
import { openReaderSettings, readPushSupport } from "@/lib/push-client";
import "./mobile-push.css";

const DISMISSED = "np-mobile-push-prompt-at";
export function MobilePushPrompt() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const support = readPushSupport();
    if (!support.installed || !support.supported || support.permission !== "default") return;
    try { if (Date.now() - Number(localStorage.getItem(DISMISSED) ?? 0) < 14 * 86400_000) return; } catch {}
    const timer = setTimeout(() => {
      if (!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') && document.visibilityState === "visible") setVisible(true);
    }, 12_000);
    const onSettings = () => setVisible(false);
    window.addEventListener("np-open-settings", onSettings);
    window.addEventListener("np-push-subscribed", onSettings);
    return () => { clearTimeout(timer); window.removeEventListener("np-open-settings", onSettings); window.removeEventListener("np-push-subscribed", onSettings); };
  }, []);
  const hide = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISSED, String(Date.now())); } catch {}
  };
  if (!visible) return null;
  return <aside className="np-mobile-push-prompt" aria-label="Известия за новини">
    <div><strong>Следете вашите рубрики</strong><p>Изберете кои новини да получавате по известие.</p>
      <button type="button" className="np-gradient-bg" onClick={() => { hide(); openReaderSettings(); }}>Избери известия</button></div>
    <button type="button" aria-label="Затвори подканването за известия" onClick={hide}>×</button>
  </aside>;
}
