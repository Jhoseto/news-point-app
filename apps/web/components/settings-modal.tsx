"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, SettingsIcon } from "./icons";

const SettingsPanel = dynamic(() => import("./settings-panel").then((module) => module.SettingsPanel), {
  loading: () => <p role="status" className="py-10 text-center text-sm text-muted">Зареждане на настройките…</p>,
});

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    title.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <>
      <button ref={trigger} type="button" aria-label="Отвори настройките на четене" title="Настройки на четене" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(true)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-muted transition-colors hover:border-accent/40 hover:text-accent dark:hover:text-link">
        <SettingsIcon width={17} height={17} />
      </button>
      {open && createPortal(
        <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
        }} onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')).filter((element) => element.offsetParent !== null);
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }} className="np-settings-dialog fixed inset-0 m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%_-_1.5rem)] max-w-[40rem] overflow-hidden rounded-3xl border border-line bg-surface p-0 text-ink shadow-[0_24px_90px_rgb(0_5_22_/_0.3)]">
          <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line bg-surface px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <h2 ref={title} id={`${id}-title`} tabIndex={-1} className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink outline-none"><span className="np-ring !size-5 shrink-0" aria-hidden="true" />Настройки на четене</h2>
                <p id={`${id}-hint`} className="mt-1 text-xs leading-relaxed text-muted">Удобен изглед, съобразен с вас.</p>
              </div>
              <button type="button" aria-label="Затвори настройките" onClick={() => setOpen(false)} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-muted transition-colors hover:text-ink"><CloseIcon width={18} height={18} /></button>
            </div>
            <div className="np-scroll-soft min-h-0 overflow-y-auto overscroll-contain bg-page p-3 sm:p-4"><SettingsPanel compact /></div>
          </div>
        </dialog>, document.body,
      )}
    </>
  );
}
