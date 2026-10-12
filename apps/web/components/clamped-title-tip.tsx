"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./reader-preferences";

function isClamped(element: HTMLElement) {
  return element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1;
}

export function ClampedTitleTip({
  as: Tag = "h3",
  className = "",
  children,
}: {
  as?: "h2" | "h3";
  className?: string;
  children: string;
}) {
  const anchor = useRef<HTMLHeadingElement | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; open: boolean } | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const hide = useCallback(() => setTip(null), []);

  const show = useCallback(() => {
    const element = anchor.current;
    if (!element || !isClamped(element)) return;
    const rect = element.getBoundingClientRect();
    setTip({ x: rect.left + rect.width / 2, y: rect.top, open: reducedMotion });
    if (reducedMotion) return;
    requestAnimationFrame(() => {
      setTip((current) => (current ? { ...current, open: true } : null));
    });
  }, [reducedMotion]);

  useEffect(() => {
    if (!tip) return;
    const onScroll = () => hide();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [hide, tip]);

  return (
    <>
      <Tag
        ref={anchor}
        className={className}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </Tag>
      {portalReady && tip
        ? createPortal(
            <div
              role="tooltip"
              data-open={tip.open || undefined}
              className="np-title-float-tip"
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
