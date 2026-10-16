"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { DESKTOP_QUERY } from "../lib/viewport-shell";
import { useReducedMotion } from "./reader-preferences";

const TITLE_TIP_QUERY = `${DESKTOP_QUERY} and (hover: hover) and (pointer: fine)`;

function isPageScroll(event: Event) {
  const target = event.target;
  return (
    target === document ||
    target === document.documentElement ||
    target === document.body
  );
}

function isClamped(element: HTMLElement) {
  if (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) {
    return true;
  }
  const { webkitLineClamp: clamp, lineHeight } = getComputedStyle(element);
  if (!clamp || clamp === "none") return false;
  const lines = Number.parseInt(clamp, 10);
  const lh = Number.parseFloat(lineHeight);
  if (!Number.isFinite(lines) || lines <= 0 || !Number.isFinite(lh) || lh <= 0) return false;
  return element.scrollHeight > lines * lh + 1;
}

function tipPosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top };
}

export function ClampedTitleTip({
  as: Tag = "h3",
  className = "",
  tipClassName = "np-title-float-tip",
  children,
}: {
  as?: "h1" | "h2" | "h3";
  className?: string;
  /** Extra class on the portaled tooltip (e.g. on-photo hero titles). */
  tipClassName?: string;
  children: string;
}) {
  const anchor = useRef<HTMLHeadingElement | null>(null);
  const hideTimer = useRef(0);
  const [portalReady, setPortalReady] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; open: boolean } | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setPortalReady(true);
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  const hide = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setTip(null), 140);
  }, []);

  const dismiss = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    setTip(null);
  }, []);

  const show = useCallback((event: PointerEvent<HTMLHeadingElement>) => {
    // Touch also emits pointerenter, even on a laptop with a fine primary pointer.
    if (event.pointerType !== "mouse" || !window.matchMedia(TITLE_TIP_QUERY).matches) {
      dismiss();
      return;
    }
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    const element = anchor.current;
    if (!element || !isClamped(element)) return;
    const { x, y } = tipPosition(element);
    setTip({ x, y, open: reducedMotion });
    if (reducedMotion) return;
    requestAnimationFrame(() => {
      setTip((current) => (current ? { ...current, open: true } : null));
    });
  }, [dismiss, reducedMotion]);

  useEffect(() => {
    if (!tip) return;
    const query = window.matchMedia(TITLE_TIP_QUERY);
    const onCapabilityChange = () => {
      if (!query.matches) dismiss();
    };
    onCapabilityChange();
    const onScroll = (event: Event) => {
      if (!isPageScroll(event)) return;
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      const element = anchor.current;
      if (!element) {
        setTip(null);
        return;
      }
      const { x, y } = tipPosition(element);
      setTip((current) => (current ? { ...current, x, y } : null));
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", dismiss);
    query.addEventListener("change", onCapabilityChange);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", dismiss);
      query.removeEventListener("change", onCapabilityChange);
    };
  }, [dismiss, tip]);

  return (
    <>
      <Tag
        ref={anchor}
        className={className}
        onPointerEnter={show}
        onPointerLeave={hide}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") dismiss();
        }}
        onBlur={hide}
      >
        {children}
      </Tag>
      {portalReady && tip
        ? createPortal(
            <div
              role="tooltip"
              data-open={tip.open || undefined}
              className={tipClassName}
              style={{ left: tip.x, top: tip.y }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
