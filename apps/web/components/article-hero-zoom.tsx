"use client";

import { useState } from "react";
import type { CategoryRef, Media } from "@/lib/queries";
import { ArticleLightbox, type LightboxImage } from "./article-lightbox";
import { ArticleImage, CategoryPill } from "./ui";

/**
 * Hero figure wrapped in a zoom trigger. Opens the lightbox at the hero index
 * but the gallery includes every article image so users can swipe through.
 */
export function ArticleHeroZoom({
  hero,
  category,
  lightboxImages,
}: {
  hero: Media;
  category: CategoryRef | null;
  lightboxImages: LightboxImage[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const heroIndex = lightboxImages.findIndex((img) => img.src === hero.url);
  const startIndex = heroIndex >= 0 ? heroIndex : 0;

  return (
    <>
      <figure className="np-article-hero">
        <button
          type="button"
          onClick={() => setOpenIndex(startIndex)}
          aria-label="Уголеми снимката"
          className="np-article-hero-frame group relative block w-full cursor-zoom-in text-left"
        >
          <ArticleImage
            media={hero}
            priority
            sizes="(min-width: 1024px) calc(100vw - 40rem), 100vw"
            className="np-article-hero-image"
          />
          {category ? <CategoryPill category={category} className="np-article-hero-category" /> : null}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 bottom-3 inline-flex size-9 items-center justify-center rounded-full bg-black/55 text-white opacity-0 shadow-md ring-1 ring-white/15 backdrop-blur transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M20 20l-4.35-4.35M11 8v6M8 11h6" />
            </svg>
          </span>
        </button>
        {hero.caption || hero.credit ? (
          <figcaption>
            {hero.caption}
            {hero.caption && hero.credit ? " · " : ""}
            {hero.credit ? `Снимка: ${hero.credit}` : ""}
          </figcaption>
        ) : null}
      </figure>
      {openIndex !== null ? (
        <ArticleLightbox
          images={lightboxImages}
          openIndex={openIndex}
          onClose={() => setOpenIndex(null)}
          title={hero.alt}
        />
      ) : null}
    </>
  );
}