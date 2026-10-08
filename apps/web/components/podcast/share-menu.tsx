"use client";

import { useEffect, useId, useState } from "react";
import { AudioIcon } from "./visuals";

type Props = {
  url: string;
  title: string;
  summary?: string;
  /** Compact trigger for episode cards; feature style for the theatre. */
  variant?: "feature" | "card";
};

/**
 * Share an episode link so messengers/social scrapers pick up the OG card
 * at `/share/podcast/[slug]/`.
 */
export function PodcastShareMenu({ url, title, summary = "", variant = "feature" }: Props) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [message, setMessage] = useState("");
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedText = encodeURIComponent(summary ? `${title}\n${summary}` : title);
  const chatText = encodeURIComponent(summary ? `${title} — ${summary}\n${url}` : `${title}\n${url}`);

  useEffect(() => setCanNativeShare(typeof navigator.share === "function"), []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  async function nativeShare() {
    if (!navigator.share) {
      await copyShareLink();
      return;
    }
    try {
      await navigator.share({ title, text: summary || title, url });
      setOpen(false);
      setMessage("");
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setMessage("Споделянето не беше завършено.");
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Линкът е копиран.");
      setOpen(false);
    } catch {
      setMessage("Линкът не беше копиран.");
    }
  }

  const triggerClass = variant === "card" ? "np-podcast-card-share" : "np-podcast-feature-share";

  return (
    <div className={`np-podcast-share${variant === "card" ? " np-podcast-share--card" : ""}`}>
      <button
        type="button"
        className={triggerClass}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Сподели: ${title}`}
        onClick={() => setOpen((value) => !value)}
      >
        <AudioIcon name="share" />
        {variant === "feature" ? "Сподели" : null}
      </button>
      <div id={menuId} className="np-podcast-share-menu" hidden={!open} role="menu">
        {canNativeShare ? (
          <button type="button" role="menuitem" onClick={() => void nativeShare()}>
            Сподели от устройството
          </button>
        ) : null}
        <a role="menuitem" href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noreferrer">
          Facebook
        </a>
        <a role="menuitem" href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`} target="_blank" rel="noreferrer">
          X / Twitter
        </a>
        <a role="menuitem" href={`https://wa.me/?text=${chatText}`} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <a role="menuitem" href={`viber://forward?text=${chatText}`}>
          Viber
        </a>
        <a role="menuitem" href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`} target="_blank" rel="noreferrer">
          Telegram
        </a>
        <a role="menuitem" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`} target="_blank" rel="noreferrer">
          LinkedIn
        </a>
        <button type="button" role="menuitem" onClick={() => void copyShareLink()}>
          Копирай линка
        </button>
      </div>
      {message ? (
        <p className="np-podcast-feature-message" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
