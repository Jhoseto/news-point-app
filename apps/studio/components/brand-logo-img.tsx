import { BRAND_LOGO, BRAND_LOGO_DARK } from "@/lib/brand-logo";
import { withBase } from "@/lib/paths";

type Props = {
  className?: string;
  sizes?: string;
};

/** Studio logo under `/admin`. Dark artwork only when a parent has `data-theme="dark"`. */
export function BrandLogoImg({ className, sizes }: Props) {
  return (
    <>
      <img
        src={withBase(BRAND_LOGO.src)}
        srcSet={`${withBase("/brand/newspoint-logo-512w.webp")} 512w, ${withBase(BRAND_LOGO.src)} ${BRAND_LOGO.width}w`}
        sizes={sizes}
        alt={BRAND_LOGO.alt}
        width={BRAND_LOGO.width}
        height={BRAND_LOGO.height}
        decoding="async"
        className={`${className ?? ""} np-brand-logo-mark--light`}
      />
      <img
        src={withBase(BRAND_LOGO_DARK.src)}
        srcSet={`${withBase("/brand/newspoint-logo-dark-512w.webp")} 512w, ${withBase(BRAND_LOGO_DARK.src)} ${BRAND_LOGO_DARK.width}w`}
        sizes={sizes}
        alt=""
        aria-hidden="true"
        width={BRAND_LOGO_DARK.width}
        height={BRAND_LOGO_DARK.height}
        decoding="async"
        className={`${className ?? ""} np-brand-logo-mark--dark`}
      />
    </>
  );
}
