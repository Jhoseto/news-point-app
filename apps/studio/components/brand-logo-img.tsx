import { BRAND_LOGO } from "@/lib/brand-logo";
import { withBase } from "@/lib/paths";

type Props = {
  className?: string;
  sizes?: string;
};

/** Studio logo under `/admin` base path. */
export function BrandLogoImg({ className, sizes }: Props) {
  return (
    <img
      src={withBase(BRAND_LOGO.src)}
      srcSet={`${withBase("/brand/newspoint-logo-512w.webp")} 512w, ${withBase(BRAND_LOGO.src)} 998w`}
      sizes={sizes}
      alt={BRAND_LOGO.alt}
      width={BRAND_LOGO.width}
      height={BRAND_LOGO.height}
      decoding="async"
      className={className}
    />
  );
}
