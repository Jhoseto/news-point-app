import { BRAND_LOGO } from "@/lib/brand-logo";

type Props = {
  className?: string;
  sizes?: string;
  fetchPriority?: "high" | "low" | "auto";
};

/** Responsive WebP logo with intrinsic dimensions from `BRAND_LOGO`. */
export function BrandLogoImg({ className, sizes = BRAND_LOGO.sizes, fetchPriority }: Props) {
  return (
    <img
      src={BRAND_LOGO.src}
      srcSet={BRAND_LOGO.srcSet}
      sizes={sizes}
      alt={BRAND_LOGO.alt}
      width={BRAND_LOGO.width}
      height={BRAND_LOGO.height}
      decoding="async"
      fetchPriority={fetchPriority}
      className={className}
    />
  );
}
