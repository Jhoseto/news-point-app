import { BRAND_LOGO, BRAND_LOGO_DARK } from "@/lib/brand-logo";

type Props = {
  className?: string;
  sizes?: string;
  fetchPriority?: "high" | "low" | "auto";
};

/** Light wordmark by default; the dark artwork shows only under `[data-theme="dark"]`. */
export function BrandLogoImg({ className, sizes = BRAND_LOGO.sizes, fetchPriority }: Props) {
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
        fetchPriority={darkPriority}
        className={`${className ?? ""} np-brand-logo-mark--dark`}
      />
    </>
  );
}
