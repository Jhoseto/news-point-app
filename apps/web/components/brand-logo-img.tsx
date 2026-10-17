import { BRAND_LOGO, BRAND_LOGO_DARK, brandAssetUrl } from "../lib/brand-logo";
import type { CSSProperties } from "react";

type Props = {
  className?: string;
  sizes?: string;
  fetchPriority?: "high" | "low" | "auto";
  /** Fixed artwork on dark photo banners (ignores site theme). */
  appearance?: "theme" | "dark" | "light";
  /** Header is only 113/141 CSS px wide; CSS selects the pre-paint theme asset. */
  header?: boolean;
};

/** Light wordmark by default; the dark artwork shows only under `[data-theme="dark"]`. */
export function BrandLogoImg({ className, sizes = BRAND_LOGO.sizes, fetchPriority, appearance = "theme", header = false }: Props) {
  if (header) return <span role="img" aria-label={BRAND_LOGO.alt} className={className} style={{
    "--np-header-logo-light-ratio": BRAND_LOGO.width / BRAND_LOGO.height,
    "--np-header-logo-dark-ratio": BRAND_LOGO.width / BRAND_LOGO.height,
    "--np-header-logo-light": `url("${brandAssetUrl("/brand/newspoint-logo-512w.webp")}")`,
    "--np-header-logo-dark": `url("${brandAssetUrl("/brand/newspoint-logo-dark-512w.webp")}")`,
  } as CSSProperties} />;
  if (appearance === "dark") {
    return (
      <img
        src={BRAND_LOGO_DARK.src}
        srcSet={BRAND_LOGO_DARK.srcSet}
        sizes={sizes}
        alt={BRAND_LOGO.alt}
        width={BRAND_LOGO_DARK.width}
        height={BRAND_LOGO_DARK.height}
        decoding="async"
        loading="lazy"
        fetchPriority={fetchPriority}
        className={className}
      />
    );
  }
  if (appearance === "light") {
    return (
      <img
        src={BRAND_LOGO.src}
        srcSet={BRAND_LOGO.srcSet}
        sizes={sizes}
        alt={BRAND_LOGO.alt}
        width={BRAND_LOGO.width}
        height={BRAND_LOGO.height}
        decoding="async"
        loading="lazy"
        fetchPriority={fetchPriority}
        className={className}
      />
    );
  }
  // Dark twin is CSS-hidden in light theme — never compete for LCP bandwidth.
  const darkPriority = fetchPriority === "high" ? "low" : fetchPriority;
  return (
    <>
      <img
        src={BRAND_LOGO.src}
        srcSet={BRAND_LOGO.srcSet}
        sizes={sizes}
        alt={BRAND_LOGO.alt}
        width={BRAND_LOGO.width}
        height={BRAND_LOGO.height}
        decoding="async"
        loading="lazy"
        fetchPriority={fetchPriority}
        className={`${className ?? ""} np-brand-logo-mark--light`}
      />
      <img
        src={BRAND_LOGO_DARK.src}
        srcSet={BRAND_LOGO_DARK.srcSet}
        sizes={sizes}
        alt=""
        aria-hidden="true"
        width={BRAND_LOGO_DARK.width}
        height={BRAND_LOGO_DARK.height}
        decoding="async"
        loading="lazy"
        fetchPriority={darkPriority}
        className={`${className ?? ""} np-brand-logo-mark--dark`}
      />
    </>
  );
}
