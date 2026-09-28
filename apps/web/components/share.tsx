"use client";

import { useState } from "react";
import { FacebookIcon, LinkedInIcon, LinkIcon, XIcon } from "./icons";

const buttonClass =
  "inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink transition hover:border-accent hover:text-accent dark:hover:text-link";

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

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-muted">Сподели</span>
      <a className={buttonClass} href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noopener noreferrer" aria-label="Сподели във Facebook">
        <FacebookIcon />
      </a>
      <a className={buttonClass} href={`https://x.com/intent/post?url=${encodedUrl}&text=${encodedTitle}`} target="_blank" rel="noopener noreferrer" aria-label="Сподели в X">
        <XIcon />
      </a>
      <a className={buttonClass} href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`} target="_blank" rel="noopener noreferrer" aria-label="Сподели в LinkedIn">
        <LinkedInIcon />
      </a>
      <button type="button" onClick={copy} className={buttonClass} aria-label={copied ? "Връзката е копирана" : "Копирай връзката"}>
        <LinkIcon width={16} height={16} />
      </button>
      <span role="status" className="text-xs font-semibold text-accent dark:text-link">
        {copied ? "Копирано" : ""}
      </span>
    </div>
  );
}
