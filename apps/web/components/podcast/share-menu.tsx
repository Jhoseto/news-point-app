"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, FacebookIcon, LinkIcon, LinkedInIcon, ShareIcon, XIcon } from "../icons";
import { lockDesktopViewport } from "@/lib/desktop-viewport";
import { AudioIcon, PodcastCover } from "./visuals";

type Props = {
  url: string;
  title: string;
  summary?: string;
  coverUrl?: string;
  durationLabel?: string;
  categoryName?: string | null;
  /** Compact trigger for episode cards; feature style for the theatre. */
  variant?: "feature" | "card";
};

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.94L2 22l5.2-1.36A9.94 9.94 0 1 0 12.04 2Zm5.78 14.13c-.24.68-1.4 1.25-1.93 1.33-.5.07-1.13.1-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.78-4.17-4.93-4.36-.14-.2-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.46.27-.3.59-.37.79-.37h.57c.18 0 .43-.07.67.51.24.6.82 2.07.89 2.22.07.15.12.32.02.52-.1.2-.15.32-.3.5-.14.17-.3.38-.43.51-.14.14-.29.29-.12.56.16.28.73 1.2 1.56 1.95 1.08.96 1.98 1.26 2.26 1.4.28.14.44.12.6-.07.17-.2.7-.81.88-1.09.19-.28.37-.23.62-.14.26.1 1.64.77 1.92.91.28.14.47.21.54.32.07.12.07.68-.17 1.36Z" />
    </svg>
  );
}

function TelegramGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
      <path d="M21.5 3.6 2.9 10.9c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.8 1 .8.6 0 .9-.3 1.2-.6l2.9-2.8 4.8 3.5c.9.5 1.5.2 1.7-.8L22.9 5c.3-1.2-.4-1.7-1.4-1.4ZM9.2 14.3l-.3 3.7 1.5-2.7 8.2-7.4-9.4 6.4Z" />
    </svg>
  );
}

function ViberGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
      <path d="M11.4 2C6.7 2.2 3 6 3 10.8c0 2 .7 3.8 1.8 5.3L3.6 21l5-1.2c1.4.7 3 1.1 4.7 1.1 4.9 0 8.9-3.9 8.9-8.8S18.2 2 12.2 2h-.8Zm.8 15.8c-1.4 0-2.7-.4-3.8-1l-.3-.2-2.2.5.5-2.2-.2-.3A6.5 6.5 0 0 1 5.2 10.8c0-3.6 3-6.5 6.8-6.6h.7c3.7 0 6.7 3 6.7 6.6 0 3.7-3 6.7-6.7 6.7h-.5Zm3.7-4.9c-.2-.1-1.2-.6-1.4-.7-.2-.1-.3-.1-.5.1-.1.2-.5.7-.6.8-.1.1-.2.2-.4.1-.2-.1-.9-.3-1.7-1.1-.6-.6-1.1-1.3-1.2-1.5-.1-.2 0-.3.1-.4l.4-.5c.1-.1.2-.3.2-.4 0-.1 0-.3-.1-.4-.1-.1-.5-1.1-.6-1.5-.2-.4-.3-.3-.5-.3h-.4c-.1 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 3.9 3.4.5.2 1 .4 1.3.5.6.2 1.1.2 1.5.1.5-.1 1.2-.5 1.4-1 .2-.5.2-.9.1-1 0-.1-.2-.1-.4-.2Z" />
    </svg>
  );
}

/**
 * Centered share dialog — ISO-style sheet with channel grid + copy link.
 * OG preview still comes from `/share/podcast/[slug]/` when the link is pasted.
 */
export function PodcastShareMenu({
  url,
  title,
  summary = "",
  coverUrl,
  durationLabel,
  categoryName,
  variant = "feature",
}: Props) {
  const dialogId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedText = encodeURIComponent(summary ? `${title}\n${summary}` : title);
  const chatText = encodeURIComponent(summary ? `${title} — ${summary}\n${url}` : `${title}\n${url}`);
  const meta = [durationLabel, categoryName ?? "NewsPodcast"].filter(Boolean).join(" · ");

  useEffect(() => setCanNativeShare(typeof navigator.share === "function"), []);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const previousOverflow = document.body.style.overflow;
    const releaseViewport = lockDesktopViewport();
    document.body.style.overflow = "hidden";
    element.showModal();
    heading.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      releaseViewport();
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);

  async function nativeShare() {
    if (!navigator.share) {
      await copyShareLink();
      return;
    }
    try {
      await navigator.share({ title, text: summary || title, url });
      setOpen(false);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setStatus("Споделянето не беше завършено.");
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setStatus("Линкът е копиран.");
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setStatus("Линкът не беше копиран.");
    }
  }

  function closeAfterChannel() {
    setOpen(false);
  }

  const triggerClass = variant === "card" ? "np-podcast-card-share" : "np-podcast-feature-share";
  const channels = [
    {
      key: "facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      className: "np-podcast-share-channel--facebook",
      icon: <FacebookIcon width={22} height={22} />,
    },
    {
      key: "x",
      label: "X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      className: "np-podcast-share-channel--x",
      icon: <XIcon width={20} height={20} />,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/?text=${chatText}`,
      className: "np-podcast-share-channel--whatsapp",
      icon: <WhatsAppGlyph />,
    },
    {
      key: "viber",
      label: "Viber",
      href: `viber://forward?text=${chatText}`,
      className: "np-podcast-share-channel--viber",
      icon: <ViberGlyph />,
    },
    {
      key: "telegram",
      label: "Telegram",
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      className: "np-podcast-share-channel--telegram",
      icon: <TelegramGlyph />,
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      className: "np-podcast-share-channel--linkedin",
      icon: <LinkedInIcon width={20} height={20} />,
    },
  ] as const;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={triggerClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={`Сподели: ${title}`}
        onClick={() => {
          setStatus("");
          setCopied(false);
          setOpen(true);
        }}
      >
        <AudioIcon name="share" />
        {variant === "feature" ? "Сподели" : null}
      </button>

      {open
        ? createPortal(
            <dialog
              ref={dialog}
              id={dialogId}
              aria-labelledby={`${dialogId}-title`}
              className="np-podcast-share-dialog"
              onCancel={() => setOpen(false)}
              onClose={() => setOpen(false)}
              onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (
                  event.clientX < bounds.left ||
                  event.clientX > bounds.right ||
                  event.clientY < bounds.top ||
                  event.clientY > bounds.bottom
                ) {
                  setOpen(false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Tab") return;
                const controls = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), a[href], [tabindex="0"]',
                  ),
                ).filter((element) => element.offsetParent !== null);
                const first = controls[0];
                const last = controls.at(-1);
                if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }}
            >
              <div className="np-podcast-share-sheet">
                <header className="np-podcast-share-sheet-head">
                  <div>
                    <p className="np-podcast-share-sheet-kicker">NewsPodcast</p>
                    <h2 ref={heading} id={`${dialogId}-title`} tabIndex={-1} className="np-podcast-share-sheet-title">
                      Сподели епизода
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="np-podcast-share-sheet-close"
                    aria-label="Затвори"
                    onClick={() => setOpen(false)}
                  >
                    <CloseIcon width={18} height={18} />
                  </button>
                </header>

                <div className="np-podcast-share-preview">
                  {coverUrl ? (
                    <div className="np-podcast-share-preview-art" aria-hidden="true">
                      <PodcastCover src={coverUrl} />
                    </div>
                  ) : null}
                  <div className="np-podcast-share-preview-copy">
                    <p className="np-podcast-share-preview-title">{title}</p>
                    {meta ? <p className="np-podcast-share-preview-meta">{meta}</p> : null}
                  </div>
                </div>

                <div className="np-podcast-share-channels" role="group" aria-label="Мрежи и чатове">
                  {channels.map((channel) => (
                    <a
                      key={channel.key}
                      href={channel.href}
                      target={channel.key === "viber" ? undefined : "_blank"}
                      rel="noreferrer"
                      className={`np-podcast-share-channel ${channel.className}`}
                      onClick={closeAfterChannel}
                    >
                      <span className="np-podcast-share-channel-icon">{channel.icon}</span>
                      <span className="np-podcast-share-channel-label">{channel.label}</span>
                    </a>
                  ))}
                  {canNativeShare ? (
                    <button type="button" className="np-podcast-share-channel np-podcast-share-channel--native" onClick={() => void nativeShare()}>
                      <span className="np-podcast-share-channel-icon">
                        <ShareIcon width={20} height={20} />
                      </span>
                      <span className="np-podcast-share-channel-label">Още</span>
                    </button>
                  ) : null}
                </div>

                <div className="np-podcast-share-copy">
                  <label className="np-podcast-share-copy-label" htmlFor={`${dialogId}-link`}>
                    Линк към епизода
                  </label>
                  <div className="np-podcast-share-copy-row">
                    <input id={`${dialogId}-link`} className="np-podcast-share-copy-input" value={url} readOnly onFocus={(event) => event.currentTarget.select()} />
                    <button type="button" className="np-podcast-share-copy-btn" data-copied={copied || undefined} onClick={() => void copyShareLink()}>
                      <LinkIcon width={16} height={16} />
                      {copied ? "Копирано" : "Копирай"}
                    </button>
                  </div>
                  <p className="np-podcast-share-status" role="status" aria-live="polite">
                    {status}
                  </p>
                </div>
              </div>
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
}
