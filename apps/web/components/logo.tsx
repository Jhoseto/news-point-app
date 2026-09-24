import Link from "next/link";

const LOGO_WIDTH = 1261;
const LOGO_HEIGHT = 343;

export function Logo({ className = "h-10" }: { className?: string }) {
  return (
    <Link href="/" aria-label="NewsPoint.bg – начало" className="inline-flex shrink-0 items-center">
      <img
        src="/brand/newspoint-logo.webp"
        alt="NewsPoint.bg"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className={`${className} w-auto dark:hidden`}
      />
      <img
        src="/brand/newspoint-logo-dark.webp"
        alt="NewsPoint.bg"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className={`${className} hidden w-auto dark:block`}
      />
    </Link>
  );
}
