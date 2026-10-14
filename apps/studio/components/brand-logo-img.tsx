import { BRAND_LOGO, BRAND_LOGO_DARK } from "@/lib/brand-logo";
import { withBase } from "@/lib/paths";

type Props = {
  className?: string;
  sizes?: string;
};

/** Square emblem on white — same rings as the public site favicon. */
export function BrandLogoImg({ className, sizes }: Props) {
  return (
    <img
      src={withBase(BRAND_LOGO.src)}
      srcSet={`${withBase("/brand/studio-mark-512w.webp")} 512w, ${withBase(BRAND_LOGO.src)} 256w`}
      sizes={sizes ?? "64px"}
      alt={BRAND_LOGO.alt}
      width={BRAND_LOGO.width}
      height={BRAND_LOGO.height}
      decoding="async"
      className={className}
    />
  );
}
