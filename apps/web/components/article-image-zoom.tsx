"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ArticleLightbox, type LightboxImage } from "./article-lightbox";

/** Server-rendered image/crop stays in place; only the zoom interaction is client-side. */
export function ArticleImageZoom({ images, imageIndex, children }: {
  images: LightboxImage[]; imageIndex: number; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const image = images[imageIndex];
  if (!image) return children;
  return <>
    <button type="button" className="np-article-image-zoom" aria-label={image.alt ? `Уголеми снимката: ${image.alt}` : "Уголеми снимката"} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      {children}
    </button>
    {open ? <ArticleLightbox images={images} openIndex={imageIndex} onClose={close} title={image.alt} /> : null}
  </>;
}
