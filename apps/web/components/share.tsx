"use client";

import { useState } from "react";
import { FacebookIcon, LinkedInIcon, LinkIcon, ShareIcon, XIcon } from "./icons";

const buttonClass = "np-article-share-button";

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // On phones with system share (navigator.share) the first option hands off to it,
  // per MOBILE_PLAN.md. Falls back to copy when neither share nor a network is available.
  const systemShare = async () => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ url, title });
        return;
      }
    } catch {}
    await copy();
  };

  return (
    <div className="np-article-share">
      <span className="np-article-share-label"><small>Споделете</small><strong>Историята</strong></span>
      <button type="button" onClick={systemShare} className={`${buttonClass} np-article-share-system md:hidden`} aria-label="Сподели чрез системата">
        <ShareIcon width={16} height={16} />
      </button>
      <a className={`${buttonClass} hidden md:inline-flex`} href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noopener noreferrer" aria-label="Сподели във Facebook">
        <FacebookIcon />
      </a>
      <a className={`${buttonClass} hidden md:inline-flex`} href={`https://x.com/intent/post?url=${encodedUrl}&text=${encodedTitle}`} target="_blank" rel="noopener noreferrer" aria-label="Сподели в X">
        <XIcon />
      </a>
      <a className={`${buttonClass} hidden md:inline-flex`} href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`} target="_blank" rel="noopener noreferrer" aria-label="Сподели в LinkedIn">
        <LinkedInIcon />
      </a>
      <button type="button" onClick={copy} className={buttonClass} aria-label={copied ? "Връзката е копирана" : "Копирай връзката"}>
        <LinkIcon width={16} height={16} />
      </button>
      <span role="status" className="np-article-share-status">
        {copied ? "Копирано" : ""}
      </span>
    </div>
  );
}
