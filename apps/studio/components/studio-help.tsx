"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DELAY = 1000;
type Help = { anchor: HTMLElement; text: string };

/** One delegated listener set also covers server-rendered fields and newly opened dialogs. */
export function StudioHelp() {
  const id = useId();
  const [help, setHelp] = useState<Help | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const keepOpen = useRef<() => void>(() => {});
  const closeSoon = useRef<() => void>(() => {});

  useEffect(() => {
    let anchor: HTMLElement | null = null;
    let shown = false;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { clearTimeout(showTimer); clearTimeout(hideTimer); showTimer = undefined; };
    const hide = () => { clear(); anchor = null; shown = false; setHelp(null); setPosition(null); };
    const insideTooltip = (target: EventTarget | null) => target instanceof Node && tooltip.current?.contains(target);
    const find = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>("[data-help]") : null;
    const schedule = (next: HTMLElement | null) => {
      if (!next?.dataset.help?.trim()) return;
      clearTimeout(hideTimer);
      if (anchor === next && (showTimer !== undefined || shown)) return;
      hide(); anchor = next;
      showTimer = setTimeout(() => {
        showTimer = undefined;
        if (anchor === next && next.isConnected) { shown = true; setHelp({ anchor: next, text: next.dataset.help!.trim() }); }
      }, DELAY);
    };
    keepOpen.current = () => clearTimeout(hideTimer);
    closeSoon.current = () => { clearTimeout(showTimer); showTimer = undefined; hideTimer = setTimeout(hide, 160); };
    const over = (event: PointerEvent) => {
      if (event.pointerType === "touch" || insideTooltip(event.target)) return;
      schedule(find(event.target));
    };
    const out = (event: PointerEvent) => {
      if (!anchor || find(event.target) !== anchor) return;
      if (find(event.target) === find(event.relatedTarget) || insideTooltip(event.relatedTarget)) return;
      closeSoon.current();
    };
    const focus = (event: FocusEvent) => schedule(find(event.target));
    const blur = (event: FocusEvent) => { if (!insideTooltip(event.relatedTarget)) hide(); };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Dismiss the visible help before Escape reaches an underlying editor/dialog.
      if (shown) { event.preventDefault(); event.stopPropagation(); }
      hide();
    };
    const press = (event: PointerEvent) => { if (!insideTooltip(event.target)) hide(); };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", press);
    document.addEventListener("input", hide);
    document.addEventListener("change", hide);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      clear(); document.removeEventListener("pointerover", over); document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", focus); document.removeEventListener("focusout", blur);
      document.removeEventListener("keydown", key, true); document.removeEventListener("pointerdown", press);
      document.removeEventListener("input", hide); document.removeEventListener("change", hide);
      document.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide);
    };
  }, []);

  useLayoutEffect(() => {
    if (!help || !tooltip.current) return;
    const anchor = document.activeElement instanceof HTMLElement && help.anchor.contains(document.activeElement) ? document.activeElement : help.anchor;
    const described = anchor.getAttribute("aria-describedby");
    anchor.setAttribute("aria-describedby", [described, id].filter(Boolean).join(" "));
    const target = help.anchor.getBoundingClientRect(), box = tooltip.current.getBoundingClientRect();
    const left = Math.max(12, Math.min(target.left + (target.width - box.width) / 2, window.innerWidth - box.width - 12));
    const below = target.bottom + 8;
    const top = Math.max(12, below + box.height <= window.innerHeight - 12 ? below : target.top - box.height - 8);
    setPosition({ left, top });
    return () => {
      // Remove only our description; preserve any IDs another component added meanwhile.
      const remaining = (anchor.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(value => value && value !== id);
      if (remaining.length) anchor.setAttribute("aria-describedby", remaining.join(" "));
      else anchor.removeAttribute("aria-describedby");
    };
  }, [help, id]);

  return help ? createPortal(<div ref={tooltip} id={id} role="tooltip" className="np-studio-help"
    style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
    onPointerEnter={() => keepOpen.current()} onPointerLeave={() => closeSoon.current()}>{help.text}</div>, help.anchor.closest("dialog") ?? document.body) : null;
}
