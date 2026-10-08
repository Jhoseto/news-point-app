"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native modal: focus stays inside, Escape closes and focus returns to its trigger. */
export function EditorDialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  return <dialog ref={ref} className="np-editor-dialog" aria-label={label} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}>
    <button type="button" className="np-dialog-close" aria-label="Затвори диалога" onClick={onClose}>×</button>
    {children}
  </dialog>;
}
